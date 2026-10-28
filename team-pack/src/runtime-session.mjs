// Match session for the MCP Helper: keeps credentials in memory, talks to Game Master,
// enforces the submission contract and writes the mandatory progress events.
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompanyMcp } from './company-mcp.mjs';
import { git, gitOk } from './git.mjs';
import { HttpError, cookieHeader, mergeCookies, request } from './http.mjs';
import { ProgressLog, clip } from './progress.mjs';
import { answerProblems } from './schema.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40,64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,31}$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');
const allowLoopback = process.env.MTM_HELPER_ALLOW_LOOPBACK === '1'; // mock tests only
// Existing test files: changing or deleting one needs an explicit, recorded reason.
const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|Tests?\.(cs|java|py)$|(^|\/)test_[^/]+\.py$/;
const SCRATCH = '.mtm-tmp';
const SLOT_NAME = /^s[1-3]$/;
const SCHEMA_MODULE = join(dirname(fileURLToPath(import.meta.url)), 'schema.mjs');

export class ToolError extends Error {
  constructor(code, message, details) { super(message ?? code); this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new ToolError(code, message, details); };

function within(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function parseDescriptor(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') fail('INVALID_DESCRIPTOR', 'descriptor must be an object or JSON text');
  const text = value.trim();
  const start = text.indexOf('{');
  // Accept the raw frame ("START_GAME_V4\n{...}") or the JSON line alone.
  for (const line of [text, ...text.slice(start).split(/\r?\n/)]) {
    try { const v = JSON.parse(line.slice(line.indexOf('{'))); if (v && typeof v === 'object') return v; } catch { /* next */ }
  }
  fail('INVALID_DESCRIPTOR', 'descriptor JSON could not be parsed');
}

const PHASE = { PREPARE_GAME: 'PREPARATION', RESUME_PREPARATION: 'PREPARATION', START_GAME: 'GAME', RESUME_GAME: 'GAME' };

export class MatchSession {
  constructor() {
    this.cfg = null;
    this.jar = new Map();
    this.projection = null;
    this.signature = null;
    this.known = new Set();
    this.company = null;
  }

  // ---------- configuration ----------
  configure({ descriptors }) {
    if (!Array.isArray(descriptors) || descriptors.length === 0) fail('INVALID_DESCRIPTOR', 'descriptors must be a non-empty array');
    const merged = {};
    for (const d of descriptors.map(parseDescriptor)) {
      if (merged.matchId && d.matchId && d.matchId !== merged.matchId) fail('DESCRIPTOR_MISMATCH', 'descriptors belong to different matches');
      Object.assign(merged, d);
    }
    const phase = PHASE[merged.type];
    if (!phase) fail('INVALID_DESCRIPTOR', `unsupported descriptor type ${merged.type}`);
    for (const k of ['playerSessionId', 'matchId', 'teamId', 'checkoutRoot', 'matchRoot', 'repository', 'matchPageUrl']) {
      if (merged[k] === undefined || merged[k] === null) fail('INVALID_DESCRIPTOR', `missing ${k}`);
    }
    const repo = merged.repository;
    if (!repo?.url || !repo?.branch || !repo?.folder) fail('INVALID_DESCRIPTOR', 'repository must have url, branch, folder');
    const checkoutRoot = resolve(merged.checkoutRoot);
    const matchRoot = resolve(merged.matchRoot);
    if (matchRoot !== resolve(checkoutRoot, repo.folder)) fail('INVALID_MATCH_ROOT', 'matchRoot must equal checkoutRoot/repository.folder');
    const progressLogFile = resolve(merged.progressLogFile ??
      join(merged.teamSdlcPackWorkspace ?? join(dirname(dirname(checkoutRoot)), 'team-sdlc-pack'), 'logs', `${merged.matchId}.progress.ndjson`));
    if (!progressLogFile.endsWith(`${sep}logs${sep}${merged.matchId}.progress.ndjson`)) fail('INVALID_PROGRESS_LOG', 'unexpected progress log path');
    const gmOrigin = new URL(merged.matchPageUrl).origin;
    const origins = new Set([gmOrigin, ...(merged.allowedMatchOrigins ?? []), ...(merged.allowedApiOrigins ?? []),
      ...(merged.hostAuthorization?.allowedOrigins ?? [])].map(o => new URL(o).origin));
    const apiOrigin = merged.gameMasterApiUrl ? new URL(merged.gameMasterApiUrl).origin : gmOrigin;
    for (const o of origins) {
      const u = new URL(o);
      const loop = ['127.0.0.1', 'localhost'].includes(u.hostname);
      if (u.protocol !== 'https:' && !(allowLoopback && loop)) fail('ORIGIN_NOT_ALLOWED', `origin ${o} is not https`);
    }
    if (!origins.has(apiOrigin)) fail('ORIGIN_NOT_ALLOWED', 'gameMasterApiUrl origin is not allowlisted');
    if (merged.apiKeySecret !== undefined) {
      const key = merged.apiKeySecret;
      if (typeof key !== 'string' || !key) fail('INVALID_API_KEY', 'apiKeySecret missing');
      if (merged.apiKeyLength !== undefined && Buffer.byteLength(key, 'utf8') !== merged.apiKeyLength) fail('API_KEY_INTEGRITY', 'apiKeyLength mismatch');
      if (merged.apiKeySha256 !== undefined && sha256(key) !== merged.apiKeySha256) fail('API_KEY_INTEGRITY', 'apiKeySha256 mismatch');
    }
    const sameMatch = this.cfg && this.cfg.matchId === merged.matchId && this.cfg.playerSessionId === merged.playerSessionId;
    this.cfg = Object.freeze({
      phase, type: merged.type, playerSessionId: merged.playerSessionId, matchId: merged.matchId,
      teamId: merged.teamId, teamName: merged.teamName ?? null, teamUuid: merged.teamUuid ?? null,
      requestId: merged.requestId ?? null, repository: { url: repo.url, branch: repo.branch, folder: repo.folder },
      checkoutRoot, matchRoot, progressLogFile, gmOrigin, apiOrigin, origins: [...origins],
      username: merged.username ?? (sameMatch ? this.cfg.username : null),
      password: merged.password ?? (sameMatch ? this.cfg.password : null),
      apiKey: merged.apiKeySecret ?? (sameMatch ? this.cfg.apiKey : null),
      environmentRevision: merged.environmentRevision ?? null,
      gitPolicy: merged.gitPolicy ?? null
    });
    if (!sameMatch) { this.jar = new Map(); this.projection = null; this.signature = null; this.known = new Set(); this.company = null; }
    this.log = new ProgressLog(progressLogFile, merged.playerSessionId);
    for (const [k] of this.log.backlog) this.known.add(k);
    this.lastFresh = [];
    return {
      status: 'CONFIGURED', phase, type: merged.type, matchId: merged.matchId, teamId: merged.teamId,
      repository: this.cfg.repository, checkoutRoot, matchRoot, progressLogFile,
      gameMasterOrigin: gmOrigin, hasLogin: Boolean(this.cfg.username && this.cfg.password),
      hasApiKey: Boolean(this.cfg.apiKey), knownBacklog: [...this.known]
    };
  }

  #need() { if (!this.cfg) fail('NOT_CONFIGURED', 'call configure_session first'); return this.cfg; }

  #api(operation, backlogId, method, url, phase, httpStatus, requestId, summary, optional = false) {
    const u = new URL(url);
    try {
      this.log.append({ type: 'GAME_MASTER_API', operation, backlogId: backlogId ?? null, method,
        origin: u.protocol === 'https:' ? u.origin : null, path: u.pathname, phase,
        httpStatus: phase === 'REQUESTED' ? null : (phase === 'FAILED' && httpStatus !== null && httpStatus < 400 ? null : httpStatus),
        requestId: requestId && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(requestId) ? requestId : null,
        summary: clip(summary) }, { optional });
    } catch { /* telemetry must never break the call */ }
  }

  // ---------- portal session ----------
  async login() {
    const c = this.#need();
    if (!c.username || !c.password) fail('LOGIN_UNAVAILABLE', 'no username/password configured; pass the preparation descriptor to configure_session');
    const url = `${c.gmOrigin}/api/v1/auth/login`;
    this.#api('LOGIN', null, 'POST', url, 'REQUESTED', null, null, 'Logging in to the match portal.');
    let res;
    try {
      res = await request(url, { method: 'POST', allowedOrigins: c.origins, allowLoopback,
        headers: { 'content-type': 'application/json', accept: 'application/json', origin: c.gmOrigin, referer: `${c.gmOrigin}/login` },
        body: JSON.stringify({ username: c.username, password: c.password }) });
    } catch (error) {
      this.#api('LOGIN', null, 'POST', url, 'FAILED', null, null, `Login failed: ${error.code}`);
      throw error;
    }
    const rid = res.headers.get('x-request-id');
    if (res.status < 200 || res.status >= 300) {
      this.#api('LOGIN', null, 'POST', url, 'FAILED', res.status, rid, `Login rejected: ${res.json?.error?.code ?? res.status}`);
      fail('LOGIN_REJECTED', res.json?.error?.message ?? `HTTP ${res.status}`);
    }
    mergeCookies(this.jar, res.headers);
    this.#api('LOGIN', null, 'POST', url, 'SUCCEEDED', res.status, rid, 'Logged in to the match portal.');
    return { status: 'LOGGED_IN', role: res.json?.user?.role ?? null, cookies: this.jar.size };
  }

  async #getProjection({ retryAuth = true, log = true } = {}) {
    const c = this.#need();
    if (this.jar.size === 0) await this.login();
    const url = `${c.gmOrigin}/api/v1/match/${encodeURIComponent(c.matchId)}`;
    if (log) this.#api('REFRESH', null, 'GET', url, 'REQUESTED', null, null, 'Reading the match page.', true);
    let res;
    try {
      res = await request(url, { allowedOrigins: c.origins, allowLoopback,
        headers: { accept: 'application/json', cookie: cookieHeader(this.jar) } });
    } catch (error) {
      if (log) this.#api('REFRESH', null, 'GET', url, 'FAILED', null, null, `Match read failed: ${error.code}`, true);
      throw error;
    }
    const rid = res.headers.get('x-request-id');
    if ((res.status === 401 || (res.status >= 300 && res.status < 400)) && retryAuth) {
      if (log) this.#api('REFRESH', null, 'GET', url, 'FAILED', res.status >= 400 ? res.status : null, rid, 'Portal session expired; logging in again.', true);
      this.jar.clear();
      await this.login();
      return this.#getProjection({ retryAuth: false, log });
    }
    if (res.status !== 200 || !res.json) {
      if (log) this.#api('REFRESH', null, 'GET', url, 'FAILED', res.status >= 400 ? res.status : null, rid, `Match read failed: HTTP ${res.status}`, true);
      fail('MATCH_READ_FAILED', res.json?.error?.message ?? `HTTP ${res.status}`, { httpStatus: res.status });
    }
    mergeCookies(this.jar, res.headers);
    if (log) this.#api('REFRESH', null, 'GET', url, 'SUCCEEDED', 200, rid, 'Match page read.', true);
    const p = res.json;
    const pub = p.match?.publicId ?? p.match?.matchId ?? null;
    if (pub && String(pub).toLowerCase() !== c.matchId.toLowerCase()) fail('MATCH_IDENTITY_MISMATCH', `page shows match ${pub}`);
    const team = p.team?.code ?? p.team?.teamId ?? null;
    if (team && String(team).toLowerCase() !== c.teamId.toLowerCase()) fail('TEAM_IDENTITY_MISMATCH', `page shows team ${team}`);
    this.projection = p;
    // Every game-phase read discovers new items, whichever tool triggered it.
    this.lastFresh = c.phase === 'GAME' ? this.#discover() : [];
    return p;
  }

  #items() { return Array.isArray(this.projection?.backlog) ? this.projection.backlog : []; }

  #compactItem(item) {
    const out = {};
    for (const [k, v] of Object.entries(item ?? {})) {
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        out[k] = typeof v === 'string' && v.length > 400 ? `${v.slice(0, 400)}… (${v.length} chars; use get_backlog_item)` : v;
      } else if (Array.isArray(v)) out[k] = `[${v.length} entries; use get_backlog_item]`;
      else out[k] = '{object; use get_backlog_item}';
    }
    return out;
  }

  #title(key) {
    const item = this.#items().find(i => i.key === key);
    return clip(item?.title ?? item?.backlogTitle ?? item?.name ?? key, 160);
  }

  #board(newItems = []) {
    const p = this.projection ?? {};
    const m = p.match ?? {};
    const match = {};
    for (const [k, v] of Object.entries(m)) if (v === null || typeof v !== 'object') match[k] = v;
    return {
      match, team: p.team ? { code: p.team.code, name: p.team.name } : null,
      endpoints: { start: p.api?.startEndpoint ?? null, submit: p.api?.submissionEndpoint ?? null },
      items: this.#items().map(i => this.#compactItem(i)),
      newItems, trackedStatus: Object.fromEntries([...this.log.backlog].map(([k, v]) => [k, v.status])),
      ...(this.#hasSlots() ? { slots: this.#slotSummary() } : {})
    };
  }

  #discover() {
    const fresh = [];
    for (const item of this.#items()) {
      if (!item?.key || this.known.has(item.key)) continue;
      this.known.add(item.key);
      fresh.push(item.key);
      if (this.cfg.phase === 'GAME') {
        try {
          this.log.append({ type: 'BACKLOG_STATUS', backlogId: item.key, title: this.#title(item.key), status: 'DISCOVERED',
            summary: clip(`${item.backlogType ?? 'ITEM'} revealed${item.deadlineMinutes ? `, deadline ${item.deadlineMinutes} min` : ''}.`),
            revision: null, receiptId: null });
        } catch { /* keep going */ }
      }
    }
    return fresh;
  }

  async refresh() {
    this.#need();
    if (this.cfg.phase === 'PREPARATION') {
      // Preparation tracks nothing: known items are discovered at game start.
      await this.#getProjection();
      return this.#board([]);
    }
    await this.#getProjection();
    this.signature = this.#signature();
    return this.#board(this.lastFresh);
  }

  #signature() {
    const p = this.projection ?? {};
    return JSON.stringify([p.match?.status, p.match?.currentSequence,
      this.#items().map(i => [i.key, i.revisionNo, i.status, i.workStatus, i.latestStatus, i.scoreStatus, i.visibility])]);
  }

  async getItem({ key, refresh = false }) {
    this.#need();
    if (!KEY.test(key ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    if (refresh || !this.projection) await this.#getProjection();
    const item = this.#items().find(i => i.key === key);
    if (!item) fail('BACKLOG_ITEM_NOT_VISIBLE', `${key} is not on the match page`);
    return item;
  }

  async waitForUpdate({ timeoutMs = 240000 } = {}) {
    const c = this.#need();
    // The loop returns within ~5 s of any change (new item, status, SLOT_DONE), so a shorter wait only adds idle model
    // turns that re-send the whole context. A shorter timeout is honoured only while a worker is busy (safety net).
    const busy = existsSync(join(c.checkoutRoot, '.git', 'mtm', 'slots.json'))
      && Object.values(this.#slots()).some(s => s.item && s.state === 'BUSY');
    const ms = busy ? Math.min(Math.max(Number(timeoutMs) || 240000, 5000), 240000) : 240000;
    const deadline = Date.now() + ms;
    if (!this.projection) await this.#getProjection();
    const before = this.signature ?? this.#signature();
    let lastFull = Date.now();
    while (Date.now() < deadline) {
      const done = this.#newSlotResults();
      if (done.length) return { changed: true, reason: 'SLOT_DONE', slotDone: done, board: this.#board([]) };
      const status = this.projection?.match?.status;
      if (status && !['IN_PROGRESS', 'PREPARING', 'PREPARED', 'READY'].includes(status)) {
        return { changed: true, reason: `MATCH_${status}`, board: this.#board([]) };
      }
      let wait = 5000;
      try {
        const feed = this.projection?.api?.feedEndpoint;
        let full = Date.now() - lastFull > 30000 || !feed;
        if (!full) {
          const url = new URL(feed, c.gmOrigin);
          url.searchParams.set('afterSequence', String(this.projection?.match?.currentSequence ?? 0));
          const res = await request(url.href, { allowedOrigins: c.origins, allowLoopback,
            headers: { accept: 'application/json', cookie: cookieHeader(this.jar) } });
          if (res.status === 401) { this.jar.clear(); full = true; }
          else if (res.status === 409 || (res.status === 200 && (res.json?.items?.length ?? 0) > 0)) full = true;
          else if (res.status !== 200) wait = 10000;
        }
        if (full) {
          await this.#getProjection({ log: false });
          lastFull = Date.now();
          const fresh = [...this.lastFresh];
          const sig = this.#signature();
          if (sig !== before) {
            this.signature = sig;
            await this.#getProjection(); // logged read for the change that matters
            fresh.push(...this.lastFresh);
            const now = this.projection?.match?.status;
            const reason = now && now !== status && !['IN_PROGRESS', 'PREPARING', 'PREPARED', 'READY'].includes(now) ? `MATCH_${now}` : 'MATCH_UPDATED';
            return { changed: true, reason, board: this.#board(fresh) };
          }
        }
      } catch { wait = 10000; }
      const left = deadline - Date.now();
      if (left <= 0) break;
      // Slot results are checked every 5 s even while Game Master is quiet.
      await sleep(Math.min(this.#hasBusySlot() ? Math.min(wait, 5000) : wait, left));
    }
    return { changed: false, reason: 'TIMEOUT', board: this.#board([]) };
  }

  // ---------- Start Work ----------
  #endpoint(kind) {
    const c = this.cfg;
    const raw = kind === 'start' ? this.projection?.api?.startEndpoint : this.projection?.api?.submissionEndpoint;
    const uuid = this.projection?.match?.id;
    let url;
    if (raw) url = new URL(raw, c.apiOrigin);
    else if (uuid && UUID.test(uuid)) url = new URL(`/api/v1/matches/${uuid}/${kind === 'start' ? 'backlogs/start' : 'submissions'}`, c.apiOrigin);
    else fail('ENDPOINT_UNAVAILABLE', 'match page did not provide the Start Work/Submit endpoint');
    const re = kind === 'start' ? /^\/api\/v1\/matches\/([0-9a-f-]{36})\/backlogs\/start$/i : /^\/api\/v1\/matches\/([0-9a-f-]{36})\/submissions$/i;
    const m = url.pathname.match(re);
    if (!m || !UUID.test(m[1]) || url.search || url.hash) fail('ENDPOINT_NOT_ALLOWED', `unexpected endpoint ${url.pathname}`);
    if (uuid && m[1].toLowerCase() !== String(uuid).toLowerCase()) fail('ENDPOINT_NOT_ALLOWED', 'endpoint is for another match');
    if (!c.origins.includes(url.origin)) fail('ORIGIN_NOT_ALLOWED', 'endpoint origin is not allowlisted');
    return url.href;
  }

  #stateDir() {
    const dir = join(this.cfg.checkoutRoot, '.git', 'mtm');
    if (!existsSync(join(this.cfg.checkoutRoot, '.git'))) fail('CHECKOUT_MISSING', 'checkoutRoot has no .git');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Keeps scratch scripts (organizer helpers, own checks) out of every commit. */
  #excludeScratch() {
    const file = join(this.cfg.checkoutRoot, '.git', 'info', 'exclude');
    mkdirSync(dirname(file), { recursive: true });
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!current.split(/\r?\n/).includes(`${SCRATCH}/`)) writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${SCRATCH}/\n`);
  }

  #submitSchema(key) {
    const startFile = join(this.#stateDir(), `${key}.start.json`);
    if (!existsSync(startFile)) return null;
    const files = JSON.parse(readFileSync(startFile, 'utf8')).files ?? {};
    const name = Object.keys(files).find(p => p.endsWith(`${key}-submit.schema.json`)) ??
      Object.keys(files).find(p => p.endsWith('.schema.json'));
    if (!name) return null;
    try { return typeof files[name] === 'string' ? JSON.parse(files[name]) : files[name]; }
    catch { return null; }
  }

  /** Contract problems of an answer object: schema errors plus PASS rows without evidence. */
  #answerProblems(key, answer, evidenceExists) {
    return answerProblems(this.#submitSchema(key), answer, evidenceExists);
  }

  /** Pre-commit check of the working-tree answer. */
  validateAnswer({ backlogItemKey }) {
    const c = this.#need();
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    const dir = join(this.#slotOf(backlogItemKey)?.matchRoot ?? c.matchRoot, 'answers', backlogItemKey);
    const file = join(dir, 'submit.json');
    if (!existsSync(file)) fail('ANSWER_MISSING', `${file} does not exist`);
    let answer;
    try { answer = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); }
    catch (error) { fail('ANSWER_NOT_JSON', `submit.json is not valid JSON: ${error.message}`); }
    const r = this.#answerProblems(backlogItemKey, answer, ref => existsSync(join(dir, ref)));
    return { valid: r.problems.length === 0, schemaChecked: r.schemaChecked, problems: r.problems.slice(0, 20), evidence: r.evidence };
  }

  async #changedExistingTests(full) {
    const c = this.cfg;
    const base = c.environmentRevision;
    if (!base || !SHA.test(base)) return [];
    const r = await git(c.checkoutRoot, ['diff', '--name-status', '--no-renames', base, full, '--', c.repository.folder]);
    if (r.code !== 0) return [];
    return r.stdout.split(/\r?\n/).map(l => l.split('\t')).filter(([s, p]) => p && /^[MD]/.test(s) && TEST_PATH.test(p))
      .map(([s, p]) => `${s} ${p}`);
  }

  async startWork({ backlogItemKey, slot }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'Start Work is only allowed after START_GAME');
    if (!c.apiKey) fail('API_KEY_UNAVAILABLE', 'configure_session with the START_GAME descriptor first');
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    const target = slot ? this.#claimSlot(slot, backlogItemKey) : null; // checked before Start Work is sent
    if (!this.projection) await this.#getProjection();
    this.#discover(); // a projection loaded before START_GAME has not been discovered yet
    const url = this.#endpoint('start');
    const body = JSON.stringify({ backlogItemKey });
    let res;
    for (let attempt = 1; ; attempt++) {
      this.#api('START_WORK', backlogItemKey, 'POST', url, 'REQUESTED', null, null, `Start Work ${backlogItemKey}.`);
      try {
        res = await request(url, { method: 'POST', body, allowedOrigins: c.origins, allowLoopback,
          headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json', accept: 'application/json' } });
      } catch (error) {
        this.#api('START_WORK', backlogItemKey, 'POST', url, 'FAILED', null, null, `Start Work ${backlogItemKey} ${error.code}.`);
        if (attempt < 3) { await sleep(2000 * attempt); continue; }
        throw error;
      }
      if ((res.status >= 500 || res.status === 429) && attempt < 3) {
        this.#api('START_WORK', backlogItemKey, 'POST', url, 'FAILED', res.status, res.headers.get('x-request-id'), `Start Work ${backlogItemKey} HTTP ${res.status}; retrying.`);
        await sleep(Number(res.headers.get('retry-after')) * 1000 || 2000 * attempt);
        continue;
      }
      break;
    }
    const rid = res.headers.get('x-request-id');
    if (res.status !== 200 && res.status !== 201) {
      this.#api('START_WORK', backlogItemKey, 'POST', url, 'FAILED', res.status, rid, `Start Work ${backlogItemKey} rejected: ${res.json?.error?.code ?? res.status}.`);
      fail(res.json?.error?.code ?? 'START_WORK_FAILED', res.json?.error?.message ?? `HTTP ${res.status}`, { httpStatus: res.status });
    }
    this.#api('START_WORK', backlogItemKey, 'POST', url, 'SUCCEEDED', res.status, rid, `Start Work ${backlogItemKey} accepted.`);
    const r = res.json ?? {};
    const dir = this.#stateDir();
    this.#excludeScratch();
    writeFileSync(join(dir, `${backlogItemKey}.start.json`), JSON.stringify(r, null, 2));
    const saved = [];
    for (const [p, content] of Object.entries(r.files ?? {})) {
      const target = normalize(join(dir, backlogItemKey, 'files', p));
      if (!within(join(dir, backlogItemKey, 'files'), target)) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      saved.push(target);
    }
    if (target) await this.#resetSlot(target, backlogItemKey);
    // Canonical answer location: <folder>/answers/<ID>/submit.json + evidence/ (in the slot when one is used).
    const answerDir = join(target?.matchRoot ?? c.matchRoot, 'answers', backlogItemKey);
    mkdirSync(join(answerDir, 'evidence'), { recursive: true });
    const submitPath = join(answerDir, 'submit.json');
    if (r.submitTemplate && !existsSync(submitPath)) writeFileSync(submitPath, JSON.stringify(r.submitTemplate, null, 2) + '\n');
    if (r.minimumVerificationScenarios) writeFileSync(join(dir, `${backlogItemKey}.mvs.json`), JSON.stringify(r.minimumVerificationScenarios, null, 2));
    const prev = this.log.backlog.get(backlogItemKey)?.status;
    const required = Array.isArray(r.submitTemplate?.testResults) ? r.submitTemplate.testResults.length : 0;
    if (!prev || prev === 'DISCOVERED') {
      try {
        this.log.append({ type: 'BACKLOG_STATUS', backlogId: backlogItemKey, title: this.#title(backlogItemKey), status: 'IN_PROGRESS',
          summary: 'Start Work accepted; work started.', revision: null, receiptId: null });
        // "Before testing" milestone; required = test-case rows of the submit template.
        this.log.append({ type: 'BACKLOG_TESTS', backlogId: backlogItemKey, status: 'NOT_RUN', required, executed: 0, passed: 0,
          failed: 0, skipped: 0, summary: required ? `${required} test case(s) pending.` : 'No test cases defined; verification pending.' });
      } catch { /* telemetry */ }
    }
    const json = JSON.stringify(r);
    if (target) return this.#writeSlotBrief(target, backlogItemKey, r, submitPath, required);
    return {
      backlogId: r.backlogId ?? backlogItemKey, backlogType: r.backlogType ?? null, replay: r.replay ?? null,
      item: this.#items().find(i => i.key === backlogItemKey) ?? null,
      requiredTestCases: required,
      startInstruction: r.startInstruction ?? '', submitTemplate: r.submitTemplate ?? null,
      minimumVerificationScenarios: json.length > 120000 ? `(large; read ${join(dir, `${backlogItemKey}.mvs.json`)})` : r.minimumVerificationScenarios ?? null,
      answerFile: submitPath, evidenceDir: join(answerDir, 'evidence'),
      submitSchema: this.#submitSchema(backlogItemKey) ? 'saved; validate_answer checks submit.json against it' : null,
      scratchDirName: `${SCRATCH}/ (git-ignored; put organizer scripts and your own check scripts there, e.g. <app folder>/${SCRATCH}/)`,
      savedResponse: join(dir, `${backlogItemKey}.start.json`), savedFiles: saved
    };
  }

  // ---------- Submit ----------
  async #verifyRevision(key, revision) {
    const c = this.cfg;
    const cwd = c.checkoutRoot;
    const full = (await gitOk(cwd, ['rev-parse', '--verify', `${revision ?? 'HEAD'}^{commit}`])).trim();
    if (!SHA.test(full)) fail('INVALID_REVISION', 'could not resolve a full commit SHA');
    const fetched = await git(cwd, ['fetch', '--quiet', 'origin', c.repository.branch], { timeoutMs: 90000 });
    if (fetched.code !== 0) fail('GIT_FETCH_FAILED', clip(fetched.stderr, 300));
    const pushed = await git(cwd, ['merge-base', '--is-ancestor', full, `origin/${c.repository.branch}`]);
    if (pushed.code !== 0) fail('REVISION_NOT_PUSHED', `${full} is not on origin/${c.repository.branch}; push first`);
    const answerPath = `${c.repository.folder}/answers/${key}/submit.json`;
    const shown = await git(cwd, ['show', `${full}:${answerPath}`]);
    if (shown.code !== 0) fail('ANSWER_NOT_COMMITTED', `${answerPath} is missing in ${full}`);
    let answer;
    try { answer = JSON.parse(shown.stdout); } catch { fail('ANSWER_NOT_JSON', `${answerPath} is not valid JSON`); }
    const bad = [];
    const walk = v => {
      if (typeof v === 'string') { if (v.includes(`answers/${key}/`)) bad.push(v); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(answer);
    if (bad.length) fail('EVIDENCE_PATH_INVALID', `use paths relative to answers/${key}/ (evidence/<file>): ${bad.slice(0, 3).join(', ')}`);
    const prefix = `${c.repository.folder}/answers/${key}/`;
    const listed = await gitOk(cwd, ['ls-tree', '-r', '--name-only', full, '--', prefix]);
    const committed = new Set(listed.split(/\r?\n/).filter(Boolean).map(p => p.slice(prefix.length)));
    const check = this.#answerProblems(key, answer, ref => committed.has(ref));
    const missing = check.problems.filter(p => p.startsWith('missing evidence file'));
    if (missing.length) fail('EVIDENCE_NOT_COMMITTED', `in ${full}: ${missing.slice(0, 5).join('; ')}`);
    if (check.problems.length) {
      fail('ANSWER_SCHEMA_INVALID', `submit.json in ${full.slice(0, 12)} breaks the submit contract (a file that does not validate scores 0): ` +
        check.problems.slice(0, 8).join('; '), { problems: check.problems.slice(0, 20) });
    }
    const scratch = await git(cwd, ['ls-tree', '-r', '--name-only', full, '--', c.repository.folder]);
    if (scratch.stdout.split(/\r?\n/).some(p => p.includes(`/${SCRATCH}/`))) fail('SCRATCH_COMMITTED', `${SCRATCH}/ files are committed; remove them from Git`);
    return { full, answer, evidence: check.evidence, schemaChecked: check.schemaChecked };
  }

  /** Final BACKLOG_TESTS event from the counts the agent observed; rejects impossible counts. */
  #logTests(key, tests) {
    const n = k => Number.isSafeInteger(tests?.[k]) && tests[k] >= 0 ? tests[k] : null;
    const counts = { required: n('required'), executed: n('executed'), passed: n('passed'), failed: n('failed'), skipped: n('skipped') ?? 0 };
    if (Object.values(counts).some(v => v === null)) fail('INVALID_TEST_COUNTS', 'tests needs integer required, executed, passed, failed (skipped optional)');
    const status = counts.failed > 0 ? 'FAILED' : 'PASSED';
    const summary = clip(tests.summary ?? `${counts.passed}/${counts.executed} passed, ${counts.failed} failed.`);
    try { this.log.append({ type: 'BACKLOG_TESTS', backlogId: key, status, ...counts, summary }); }
    catch (error) { fail('INVALID_TEST_COUNTS', error.message); }
    return status;
  }

  async submitWork({ backlogItemKey, gitRevision, acknowledgeTestChanges, tests }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'Submit is only allowed after START_GAME');
    if (!c.apiKey) fail('API_KEY_UNAVAILABLE', 'configure_session with the START_GAME descriptor first');
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    const stateFile = join(this.#stateDir(), 'submissions.json');
    const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
    const prior = state[backlogItemKey];
    if (prior?.receipt) return { status: 'ALREADY_SUBMITTED_LOCALLY', receipt: prior.receipt, gitRevision: prior.gitRevision };
    const { full, answer, evidence, schemaChecked } = await this.#verifyRevision(backlogItemKey, gitRevision);
    const changedTests = await this.#changedExistingTests(full);
    const reason = typeof acknowledgeTestChanges === 'string' ? acknowledgeTestChanges.trim() : '';
    if (changedTests.length && reason.length < 30) {
      fail('EXISTING_TESTS_MODIFIED', 'existing tests were changed or deleted. Never weaken a test to make it pass; fix the code. ' +
        'Only if the brief explicitly allows correcting a test that contradicts intended behaviour, explain it in the answer ' +
        'and call submit_work again with acknowledgeTestChanges set to that reason (30+ characters).', { changedTests: changedTests.slice(0, 20) });
    }
    if (!this.projection) await this.#getProjection();
    const url = this.#endpoint('submit');
    const testStatus = tests ? this.#logTests(backlogItemKey, tests) : null;
    const bodyFor = id => JSON.stringify({ clientSubmissionId: id, backlogItemKey, gitRevision: full, answer });
    let clientSubmissionId = prior?.clientSubmissionId;
    if (!clientSubmissionId || prior.bodySha !== sha256(bodyFor(prior.clientSubmissionId))) clientSubmissionId = randomUUID();
    const body = bodyFor(clientSubmissionId);
    if (body.length > 500000) fail('PAYLOAD_TOO_LARGE', 'submission body exceeds the server limit');
    state[backlogItemKey] = { clientSubmissionId, bodySha: sha256(body), gitRevision: full, receipt: null, outcome: 'SENDING' };
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    let res;
    for (let attempt = 1; attempt <= 5; attempt++) {
      this.#api('SUBMIT', backlogItemKey, 'POST', url, 'REQUESTED', null, null, `Submit ${backlogItemKey} at ${full.slice(0, 12)}.`);
      try {
        res = await request(url, { method: 'POST', body, timeoutMs: 45000, allowedOrigins: c.origins, allowLoopback,
          headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json', accept: 'application/json',
            'idempotency-key': clientSubmissionId } });
      } catch (error) {
        this.#api('SUBMIT', backlogItemKey, 'POST', url, 'FAILED', null, null, `Submit ${backlogItemKey} ${error.code}; retrying with the same key.`);
        res = null;
        await sleep(2000 * attempt);
        continue;
      }
      if (res.status >= 500 || res.status === 429) {
        this.#api('SUBMIT', backlogItemKey, 'POST', url, 'FAILED', res.status, res.headers.get('x-request-id'), `Submit ${backlogItemKey} HTTP ${res.status}; retrying with the same key.`);
        await sleep(Number(res.headers.get('retry-after')) * 1000 || 2000 * attempt);
        continue;
      }
      break;
    }
    if (!res) {
      state[backlogItemKey].outcome = 'UNCERTAIN';
      writeFileSync(stateFile, JSON.stringify(state, null, 2));
      fail('SUBMIT_OUTCOME_UNCERTAIN', 'no response after retries; call submit_work again (same key and body are reused)');
    }
    const rid = res.headers.get('x-request-id');
    const code = res.json?.error?.code;
    if (res.status === 201 || res.status === 200) {
      const s = res.json?.submission ?? res.json ?? {};
      const receiptId = s.id ?? s.receiptId ?? null;
      if (!receiptId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(receiptId)) {
        this.#api('SUBMIT', backlogItemKey, 'POST', url, 'SUCCEEDED', res.status, rid, `Submit ${backlogItemKey} returned no receipt id.`);
        state[backlogItemKey].outcome = 'NO_RECEIPT';
        writeFileSync(stateFile, JSON.stringify(state, null, 2));
        fail('NO_RECEIPT', 'server returned 2xx without a submission id');
      }
      const receipt = { id: receiptId, status: s.status ?? null, scoreStatus: s.scoreStatus ?? null,
        receivedAt: s.receivedAt ?? null, attemptNo: s.attemptNo ?? null, replay: res.headers.get('idempotent-replay') === 'true' };
      state[backlogItemKey] = { ...state[backlogItemKey], receipt, outcome: 'ACCEPTED' };
      writeFileSync(stateFile, JSON.stringify(state, null, 2));
      this.#api('SUBMIT', backlogItemKey, 'POST', url, 'SUCCEEDED', res.status, rid, `Submit ${backlogItemKey} accepted (${receipt.status ?? 'ok'}).`);
      try {
        this.log.append({ type: 'BACKLOG_STATUS', backlogId: backlogItemKey, title: this.#title(backlogItemKey), status: 'SUBMITTED',
          summary: clip(`Submitted; receipt ${receipt.status ?? 'received'}, score ${receipt.scoreStatus ?? 'pending'}.`),
          revision: full, receiptId });
      } catch { /* telemetry */ }
      if (this.#slotOf(backlogItemKey)) this.#releaseSlot(this.#slotOf(backlogItemKey).name, backlogItemKey);
      // Refresh once here so the agent needs no separate refresh_match call.
      let board = null;
      try { await this.#getProjection(); this.signature = this.#signature(); board = this.#board(this.lastFresh); } catch { /* next wait_for_update refreshes */ }
      return { status: 'SUBMITTED', receipt, gitRevision: full, evidence, schemaChecked, changedTests, testStatus, board };
    }
    this.#api('SUBMIT', backlogItemKey, 'POST', url, 'FAILED', res.status, rid, `Submit ${backlogItemKey} rejected: ${code ?? res.status}.`);
    state[backlogItemKey].outcome = code ?? `HTTP_${res.status}`;
    if (code === 'ALREADY_SUBMITTED') state[backlogItemKey].receipt = { id: null, status: 'ALREADY_SUBMITTED' };
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    fail(code ?? 'SUBMIT_FAILED', res.json?.error?.message ?? `HTTP ${res.status}`, { httpStatus: res.status });
  }

  // ---------- Slots (parallel workers) ----------
  // A slot is a Git worktree of the assigned repository on a local-only branch (mtm-slot/sN). A worker
  // subagent edits and commits there; only the orchestrator integrates into the assigned branch, through
  // integrate_item, which then runs the unchanged submit_work gates.
  #slotFile() { return join(this.#stateDir(), 'slots.json'); }
  #slots() {
    if (!this.cfg) return {};
    const f = join(this.cfg.checkoutRoot, '.git', 'mtm', 'slots.json');
    try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; } catch { return {}; }
  }
  #saveSlots(all) { writeFileSync(this.#slotFile(), JSON.stringify(all, null, 2)); }
  #hasSlots() { return Object.keys(this.#slots()).length > 0; }
  #hasBusySlot() { return Object.values(this.#slots()).some(s => s.item); }
  #slotSummary() {
    return Object.values(this.#slots()).map(s => ({ slot: s.name, item: s.item ?? null, state: s.item ? s.state : 'FREE' }));
  }
  #slotOf(key) { return Object.values(this.#slots()).find(s => s.item === key) ?? null; }

  async prepareSlots({ count = 2, copyFiles = [] } = {}) {
    const c = this.#need();
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 3) fail('INVALID_SLOT_COUNT', 'count must be 1..3 (4 agent slots include the orchestrator)');
    if (!Array.isArray(copyFiles) || copyFiles.length > 10) fail('INVALID_COPY_FILES', 'copyFiles must be an array of at most 10 entries');
    const parent = `${c.checkoutRoot}.slots`;
    const head = (await gitOk(c.checkoutRoot, ['rev-parse', 'HEAD'])).trim();
    await git(c.checkoutRoot, ['worktree', 'prune']);
    this.#excludeScratch();
    const all = this.#slots();
    const out = [];
    for (let i = 1; i <= n; i++) {
      const name = `s${i}`;
      const path = join(parent, name);
      const branch = `mtm-slot/${name}`;
      if (!existsSync(join(path, '.git'))) {
        const r = await git(c.checkoutRoot, ['worktree', 'add', '-f', '-B', branch, path, head], { timeoutMs: 300000 });
        if (r.code !== 0) fail('SLOT_CREATE_FAILED', clip(r.stderr, 300));
      }
      const matchRoot = join(path, c.repository.folder);
      const copied = [];
      for (const entry of copyFiles) {
        const rel = typeof entry === 'string' ? entry : entry?.path;
        if (typeof rel !== 'string' || !rel || isAbsolute(rel)) fail('INVALID_COPY_FILES', 'each entry needs a path relative to matchRoot');
        const from = resolve(c.matchRoot, rel);
        const to = resolve(matchRoot, rel);
        if (!within(c.matchRoot, from) || !within(matchRoot, to)) fail('INVALID_COPY_FILES', `${rel} leaves matchRoot`);
        if (!existsSync(from)) continue;
        // Only git-ignored files (env files with local values); tracked files already come with the worktree.
        const ignored = await git(c.checkoutRoot, ['check-ignore', '-q', '--', relative(c.checkoutRoot, from).split(sep).join('/')]);
        if (ignored.code !== 0) fail('COPY_FILE_TRACKED', `${rel} is not git-ignored; only ignored local files may be copied`);
        let text = readFileSync(from, 'utf8');
        for (const [find, repl] of Object.entries(entry?.replace ?? {})) {
          text = text.split(find).join(String(repl).replaceAll('{slot}', name).replaceAll('{n}', String(i)));
        }
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, text);
        copied.push(rel);
      }
      all[name] = { ...(all[name] ?? {}), name, path, matchRoot, branch, index: i, item: all[name]?.item ?? null, state: all[name]?.state ?? 'FREE' };
      out.push({ slot: name, index: i, worktreeRoot: path, matchRoot, copied });
    }
    this.#saveSlots(all);
    return { slots: out, note: 'Install dependencies and prepare the database once per slot (see game-preparation).' };
  }

  #claimSlot(name, key) {
    if (!SLOT_NAME.test(name ?? '')) fail('INVALID_SLOT', 'slot is s1, s2 or s3');
    const s = this.#slots()[name];
    if (!s || !existsSync(join(s.path, '.git'))) fail('SLOT_MISSING', `${name} does not exist; call prepare_slots`);
    if (s.item && s.item !== key) fail('SLOT_BUSY', `${name} is working on ${s.item}`);
    const other = this.#slotOf(key);
    if (other && other.name !== name) fail('ITEM_IN_OTHER_SLOT', `${key} is already in ${other.name}`);
    return s;
  }

  async #resetSlot(s, key) {
    if (s.item === key) return; // Start Work replay keeps the worker's state
    const c = this.cfg;
    const head = (await gitOk(c.checkoutRoot, ['rev-parse', 'HEAD'])).trim();
    await gitOk(s.path, ['checkout', '-f', '-B', s.branch, head]);
    await gitOk(s.path, ['clean', '-fdq']); // untracked leftovers only; ignored files (deps, env) stay
    const all = this.#slots();
    all[s.name] = { ...all[s.name], item: key, state: 'BUSY', base: head, integratedTip: null, reported: null, startedAt: new Date().toISOString() };
    this.#saveSlots(all);
  }

  #writeSlotBrief(s, key, r, submitPath, required) {
    const c = this.cfg;
    const dir = join(s.matchRoot, SCRATCH, key);
    const filesDir = join(dir, 'files');
    mkdirSync(filesDir, { recursive: true });
    let schemaFile = null;
    for (const [p, content] of Object.entries(r.files ?? {})) {
      const target = normalize(join(filesDir, p));
      if (!within(filesDir, target)) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    const schema = this.#submitSchema(key);
    if (schema) { schemaFile = join(dir, 'submit.schema.json'); writeFileSync(schemaFile, JSON.stringify(schema, null, 2)); }
    // Stand-alone validator: the same checks as validate_answer, runnable by the worker with plain node.
    const lib = join(s.matchRoot, SCRATCH, '_mtm');
    mkdirSync(lib, { recursive: true });
    copyFileSync(SCHEMA_MODULE, join(lib, 'schema.mjs'));
    writeFileSync(join(dir, 'validate.mjs'), [
      "import { existsSync, readFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "import { answerProblems } from '../_mtm/schema.mjs';",
      'const here = dirname(fileURLToPath(import.meta.url));',
      `const answerDir = join(here, '..', '..', 'answers', ${JSON.stringify(key)});`,
      "const schema = existsSync(join(here, 'submit.schema.json')) ? JSON.parse(readFileSync(join(here, 'submit.schema.json'), 'utf8')) : null;",
      'let answer;',
      "try { answer = JSON.parse(readFileSync(join(answerDir, 'submit.json'), 'utf8').replace(/^\\uFEFF/, '')); }",
      "catch (e) { console.log(JSON.stringify({ valid: false, problems: ['submit.json: ' + e.message] })); process.exit(1); }",
      'const r = answerProblems(schema, answer, ref => existsSync(join(answerDir, ref)));',
      'console.log(JSON.stringify({ valid: r.problems.length === 0, schemaChecked: r.schemaChecked, problems: r.problems.slice(0, 20) }));',
      'process.exit(r.problems.length ? 1 : 0);', ''].join('\n'));
    const item = this.#items().find(i => i.key === key) ?? null;
    const brief = { backlogId: key, backlogType: r.backlogType ?? item?.backlogType ?? null, item,
      startInstruction: r.startInstruction ?? '', submitTemplate: r.submitTemplate ?? null,
      minimumVerificationScenarios: r.minimumVerificationScenarios ?? null, requiredTestCases: required,
      answerFile: submitPath, evidenceDir: join(dirname(submitPath), 'evidence'), organizerFiles: filesDir, submitSchemaFile: schemaFile,
      validateCommand: `node "${join(dir, 'validate.mjs')}"`, doneFile: join(dir, 'DONE.json') };
    writeFileSync(join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
    const map = join(c.matchRoot, SCRATCH, 'repo-map.md');
    if (existsSync(map)) copyFileSync(map, join(s.matchRoot, SCRATCH, 'repo-map.md'));
    return { backlogId: key, backlogType: brief.backlogType, title: item?.title ?? null, replay: r.replay ?? null,
      slot: s.name, slotIndex: s.index, worktreeRoot: s.path, slotMatchRoot: s.matchRoot, briefFile: join(dir, 'brief.json'),
      doneFile: brief.doneFile, requiredTestCases: required, deadlineMinutes: item?.deadlineMinutes ?? null };
  }

  /** New or rewritten DONE.json files of busy slots (each version reported once). */
  #newSlotResults() {
    if (!this.cfg || !existsSync(join(this.cfg.checkoutRoot, '.git', 'mtm', 'slots.json'))) return [];
    const all = this.#slots();
    const out = [];
    for (const s of Object.values(all)) {
      if (!s.item) continue;
      const f = join(s.matchRoot, SCRATCH, s.item, 'DONE.json');
      if (!existsSync(f)) continue;
      const raw = readFileSync(f, 'utf8');
      const sig = sha256(raw);
      if (s.reported === sig) continue;
      s.reported = sig;
      s.state = 'DONE';
      let result;
      try {
        const d = JSON.parse(raw.replace(/^﻿/, ''));
        result = { status: d.status ?? null, tests: d.tests ?? null, summary: clip(String(d.summary ?? ''), 300), doubts: d.doubts ? clip(String(d.doubts), 300) : undefined };
      } catch { result = { error: 'DONE.json is not valid JSON' }; }
      out.push({ slot: s.name, item: s.item, ...result });
    }
    if (out.length) this.#saveSlots(all);
    return out;
  }

  async integrateItem({ backlogItemKey, tests, acknowledgeTestChanges, allowUncommitted = false }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'integrate_item is only allowed after START_GAME');
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    const s = this.#slotOf(backlogItemKey);
    if (!s) fail('ITEM_NOT_IN_SLOT', `${backlogItemKey} is not assigned to a slot`);
    if (!tests) {
      const f = join(s.matchRoot, SCRATCH, backlogItemKey, 'DONE.json');
      try { tests = JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')).tests; } catch { /* below */ }
      if (!tests) fail('INVALID_TEST_COUNTS', 'pass tests or let the worker write them into DONE.json');
    }
    const dirty = (await gitOk(s.path, ['status', '--porcelain'])).trim();
    if (dirty && !allowUncommitted) {
      fail('SLOT_UNCOMMITTED', `${s.name} has uncommitted changes; the worker must commit them (or pass allowUncommitted at the safety net)`,
        { files: dirty.split(/\r?\n/).slice(0, 10) });
    }
    const cur = (await gitOk(c.checkoutRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    if (cur !== c.repository.branch) fail('BRANCH_MISMATCH', `checkoutRoot is on ${cur}, not ${c.repository.branch}`);
    const mainDirty = (await gitOk(c.checkoutRoot, ['status', '--porcelain', '--untracked-files=no'])).trim();
    if (mainDirty) fail('MAIN_DIRTY', 'checkoutRoot has uncommitted tracked changes; commit or restore them first', { files: mainDirty.split(/\r?\n/).slice(0, 10) });
    const pull = await git(c.checkoutRoot, ['pull', '--rebase', '--no-tags', 'origin', c.repository.branch], { timeoutMs: 180000 });
    if (pull.code !== 0) { await git(c.checkoutRoot, ['rebase', '--abort']); fail('GIT_PULL_FAILED', clip(pull.stderr, 300)); }
    const tip = (await gitOk(s.path, ['rev-parse', 'HEAD'])).trim();
    let base = null;
    if (s.integratedTip && (await git(c.checkoutRoot, ['merge-base', '--is-ancestor', s.integratedTip, tip])).code === 0) base = s.integratedTip;
    else base = (await gitOk(c.checkoutRoot, ['merge-base', 'HEAD', tip])).trim();
    const commits = (await gitOk(c.checkoutRoot, ['rev-list', '--reverse', '--no-merges', `${base}..${tip}`])).split(/\r?\n/).filter(Boolean);
    if (!commits.length && !s.integratedTip) fail('NOTHING_TO_INTEGRATE', `${s.name} has no commits for ${backlogItemKey}`);
    if (commits.length) {
      const names = (await gitOk(c.checkoutRoot, ['diff', '--name-only', base, tip])).split(/\r?\n/).filter(Boolean);
      const outside = names.filter(p => !p.startsWith(`${c.repository.folder}/`));
      if (outside.length) fail('OUTSIDE_FOLDER', 'the slot commits touch files outside the assigned folder', { files: outside.slice(0, 10) });
      const diff = (await gitOk(c.checkoutRoot, ['diff', base, tip])) ?? '';
      if ([c.password, c.apiKey].some(v => v && v.length >= 4 && diff.includes(v))) fail('SECRET_IN_DIFF', 'the slot commits contain a credential value');
      const pick = await git(c.checkoutRoot, ['-c', 'core.safecrlf=false', 'cherry-pick', ...commits], { timeoutMs: 120000 });
      if (pick.code !== 0) {
        const conflicts = (await git(c.checkoutRoot, ['diff', '--name-only', '--diff-filter=U'])).stdout.split(/\r?\n/).filter(Boolean);
        await git(c.checkoutRoot, ['cherry-pick', '--abort']);
        fail('INTEGRATION_CONFLICT', `${backlogItemKey} conflicts with work already on ${c.repository.branch}. Ask the worker to run ` +
          `"git -C <worktreeRoot> rebase ${c.repository.branch}", resolve, rerun its tests, commit, rewrite DONE.json; then integrate again.`,
          { conflicts: conflicts.slice(0, 10), worktreeRoot: s.path });
      }
      let push = await git(c.checkoutRoot, ['push', 'origin', `HEAD:refs/heads/${c.repository.branch}`], { timeoutMs: 180000 });
      if (push.code !== 0) {
        const again = await git(c.checkoutRoot, ['pull', '--rebase', '--no-tags', 'origin', c.repository.branch], { timeoutMs: 180000 });
        if (again.code !== 0) { await git(c.checkoutRoot, ['rebase', '--abort']); fail('GIT_PULL_FAILED', clip(again.stderr, 300)); }
        push = await git(c.checkoutRoot, ['push', 'origin', `HEAD:refs/heads/${c.repository.branch}`], { timeoutMs: 180000 });
        if (push.code !== 0) fail('GIT_PUSH_FAILED', clip(push.stderr, 300));
      }
      const all = this.#slots();
      all[s.name] = { ...all[s.name], integratedTip: tip, state: 'INTEGRATED' };
      this.#saveSlots(all);
    }
    // Every existing submit gate runs unchanged on the pushed revision.
    const result = await this.submitWork({ backlogItemKey, gitRevision: 'HEAD', tests, acknowledgeTestChanges });
    if (result.status === 'SUBMITTED' || result.status === 'ALREADY_SUBMITTED_LOCALLY') this.#releaseSlot(s.name, backlogItemKey);
    return { ...result, slot: s.name, integratedCommits: commits.length };
  }

  #releaseSlot(name, key) {
    const all = this.#slots();
    all[name] = { ...all[name], item: null, lastItem: key, state: 'FREE', reported: null };
    this.#saveSlots(all);
  }

  /** Frees a slot without submitting (item abandoned, or submitted another way). */
  releaseSlot({ slot }) {
    this.#need();
    if (!SLOT_NAME.test(slot ?? '') || !this.#slots()[slot]) fail('INVALID_SLOT', 'unknown slot');
    const key = this.#slots()[slot].item;
    this.#releaseSlot(slot, key);
    return { slot, released: key ?? null };
  }

  // ---------- progress ----------
  report(event) {
    this.#need();
    if (!event || typeof event !== 'object') fail('INVALID_PROGRESS_EVENT', 'event must be an object');
    const { schemaVersion, playerSessionId, ...body } = event;
    try { return this.log.append(body); }
    catch (error) { fail('INVALID_PROGRESS_EVENT', error.message); }
  }

  // ---------- company tools ----------
  #companyClient() {
    const c = this.#need();
    if (!c.apiKey) fail('API_KEY_UNAVAILABLE', 'company tools need the team API key (START_GAME)');
    this.company ??= new CompanyMcp({ url: `${c.apiOrigin}/api/v1/mcp/${encodeURIComponent(c.matchId)}`,
      apiKey: c.apiKey, allowedOrigins: c.origins, allowLoopback });
    return this.company;
  }

  async companyTools() {
    const tools = await this.#companyClient().listTools();
    return tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }

  async companyCall({ name, arguments: args = {}, backlogId = null, saveToSlot = false }) {
    if (typeof name !== 'string' || !name) fail('INVALID_TOOL', 'name is required');
    const toolName = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(name) ? name : 'company_tool';
    const bid = backlogId && KEY.test(backlogId) ? backlogId : null;
    const logTool = (phase, summary) => {
      try { this.log.append({ type: 'TOOL_ACTIVITY', toolName, operation: 'COMPANY_TOOL_CALL', backlogId: bid, phase, summary: clip(summary) }, { optional: true }); } catch { /* telemetry */ }
    };
    logTool('REQUESTED', `Company tool ${name}.`);
    try {
      const { result } = await this.#companyClient().callTool(name, args);
      logTool(result?.isError ? 'FAILED' : 'SUCCEEDED', `Company tool ${name} ${result?.isError ? 'returned an error' : 'answered'}.`);
      const parts = (result?.content ?? []).map(p => p.type === 'text' ? p.text : JSON.stringify(p));
      let text = parts.join('\n');
      if (text.length > 100000) text = text.slice(0, 100000) + '\n…(truncated)';
      const s = saveToSlot && bid ? this.#slotOf(bid) : null;
      if (s) {
        // The worker reads the full answer from its slot; the orchestrator keeps only a short head.
        const dir = join(s.matchRoot, SCRATCH, bid);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `company-${toolName.replace(/[^A-Za-z0-9_.-]/g, '_')}-${Date.now()}.txt`);
        writeFileSync(file, text + (result?.structuredContent ? `\n\nstructuredContent:\n${JSON.stringify(result.structuredContent, null, 2)}` : ''));
        return { isError: Boolean(result?.isError), savedTo: file, chars: text.length, head: clip(text.replace(/\s+/g, ' '), 300) };
      }
      return { isError: Boolean(result?.isError), text, structuredContent: result?.structuredContent ?? null };
    } catch (error) {
      logTool('FAILED', `Company tool ${name} failed: ${error.code ?? 'ERROR'}.`);
      throw error;
    }
  }
}

export { HttpError };
