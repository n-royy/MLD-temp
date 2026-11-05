// Match session for the MCP Helper: keeps credentials in memory, talks to Game Master,
// enforces the submission contract and writes the mandatory progress events.
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompanyMcp } from './company-mcp.mjs';
import { PROXY_FILE, relayCompany, startCompanyProxy } from './company-proxy.mjs';
import { git, gitOk } from './git.mjs';
import { HttpError, cookieHeader, mergeCookies, request } from './http.mjs';
import { ProgressLog, clip } from './progress.mjs';
import { answerProblems } from './schema.mjs';
import { jobState } from './jobs.mjs';
import { collectIncident } from './incident.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40,64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,31}$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');
const allowLoopback = process.env.MTM_HELPER_ALLOW_LOOPBACK === '1'; // mock tests only
// Existing test files: changing or deleting one needs an explicit, recorded reason.
const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|Tests?\.(cs|java|py)$|(^|\/)test_[^/]+\.py$/;
const SCRATCH = '.mtm-tmp';
const SLOT_NAME = /^s[1-5]$/;
// s5: the dedicated heavy-item worker (a 5th agent), so heavy work never takes a slot from the other items.
const HEAVY_SLOT = 's5';
// s1..s3 are worker slots; s4 is the orchestrator's own slot (PI or short TASK when every worker is busy), so its
// work never dirties the main checkout that integrate_item needs clean.
const OWN_SLOT = 's4';
// Board entries stay small: every wait_for_update result is re-sent with the orchestrator's context.
const BOARD_DROP = new Set(['description', 'brief', 'acceptanceCriteria', 'updatedByEventKey', 'updatedAt', 'body', 'markdown', 'instructions', 'summary']);
// DEADLINE_SOON fires once per item (and once per busy item before the match ends) at this many minutes left.
const SOON_MINUTES = 3;
// A heavy item works on until this close to its deadline / the match end; then its last commit is integrated at once.
const HEAVY_FINAL_MINUTES = 1.5;
// Incident fast path: a revealed PI is started in a free slot and its logs and rules are collected by code at once.
const INCIDENT_AUTO = process.env.MTM_INCIDENT_FASTPATH !== '0';
// Items the organizer marks as heavy (title prefix, e.g. "[Heavy Task] ..."): expensive, scheduled last.
const isHeavy = item => /^\s*\[\s*heavy\b[^\]]*\]/i.test(String(item?.title ?? item?.backlogTitle ?? item?.name ?? ''));
const isIncident = item => (item?.backlogType ?? item?.type) === 'PI' || /^PI-/.test(item?.key ?? '');
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
    this.seenAt = new Map();
    this.warned = new Set();
    this.company = null;
    this.incidents = new Map();
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
    if (!sameMatch) { this.jar = new Map(); this.projection = null; this.signature = null; this.known = new Set(); this.company = null; this.incidents = new Map(); }
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
    this.projectionAt = Date.now();
    // Every game-phase read discovers new items, whichever tool triggered it.
    this.lastFresh = c.phase === 'GAME' ? this.#discover() : [];
    return p;
  }

  #items() { return Array.isArray(this.projection?.backlog) ? this.projection.backlog : []; }

  #compactItem(item) {
    const out = {};
    for (const [k, v] of Object.entries(item ?? {})) {
      if (BOARD_DROP.has(k)) continue;
      if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'string' && v.length <= 160) out[k] = v; // long text: get_backlog_item (workers read it from briefFile)
      else if (k === 'submission' && v && typeof v === 'object') out.submitted = true;
    }
    const left = this.#minutesLeft(item);
    if (left !== null) out.minutesLeft = left;
    if (isHeavy(item)) out.heavy = true;
    return out;
  }

  /** Match clock in seconds since start, corrected for the age of the last projection; null when unknown. */
  #elapsedSec() {
    const m = this.projection?.match ?? {};
    const drift = (Date.now() - (this.projectionAt ?? Date.now())) / 1000;
    if (Number.isFinite(m.elapsedSec)) return m.elapsedSec + drift;
    if (Number.isFinite(m.elapsedMinutes)) return m.elapsedMinutes * 60 + drift;
    return null;
  }

  /** Minutes until an item's deadline closes it (null when it has no deadline or the clock is unknown). */
  #minutesLeft(item) {
    const dl = Number(item?.deadlineMinutes);
    if (!item || item.deadlineMinutes == null || !Number.isFinite(dl) || dl <= 0) return null;
    let elapsed = this.#elapsedSec();
    let reveal = Number.isFinite(item.revealedElapsedSec) ? item.revealedElapsedSec
      : Number.isFinite(item.revealedAtMinute) ? item.revealedAtMinute * 60 : null;
    if (elapsed === null || reveal === null) {
      const seen = this.seenAt.get(item.key);
      if (!seen) return null;
      elapsed = (Date.now() - seen) / 1000; reveal = 0; // first seen by this helper: an upper bound
    }
    return Math.round((reveal + dl * 60 - elapsed) / 6) / 10;
  }

  /** Minutes until the match ends (null when unknown). */
  #matchMinutesLeft() {
    const m = this.projection?.match ?? {};
    const drift = (Date.now() - (this.projectionAt ?? Date.now())) / 1000;
    if (Number.isFinite(m.remainingSec)) return Math.round((m.remainingSec - drift) / 6) / 10;
    const total = Number.isFinite(m.configuredDurationSec) ? m.configuredDurationSec : Number.isFinite(m.durationMinutes) ? m.durationMinutes * 60 : null;
    const el = this.#elapsedSec();
    return total !== null && el !== null ? Math.round((total - el) / 6) / 10 : null;
  }

  /** Busy items whose deadline (or the match end) is SOON_MINUTES away, each reported once. */
  #deadlineSoon() {
    if (this.cfg?.phase !== 'GAME' || this.projection?.match?.status !== 'IN_PROGRESS') return [];
    const out = [];
    const end = this.#matchMinutesLeft();
    for (const s of Object.values(this.#slots())) {
      if (!s.item) continue;
      const item = this.#items().find(i => i.key === s.item);
      const heavy = isHeavy(item);
      const soon = heavy ? HEAVY_FINAL_MINUTES : SOON_MINUTES;
      const extra = heavy ? { heavy: true, action: 'INTEGRATE_LAST_COMMIT_NOW' } : {};
      const left = this.#minutesLeft(item);
      if (left !== null && left <= soon && left > -1 && !this.warned.has(`${s.item}:deadline`)) {
        this.warned.add(`${s.item}:deadline`);
        out.push({ backlogItemKey: s.item, slot: s.name, kind: 'DEADLINE', minutesLeft: left, ...extra });
      } else if (end !== null && end <= soon && !this.warned.has(`${s.item}:end`)) {
        this.warned.add(`${s.item}:end`);
        out.push({ backlogItemKey: s.item, slot: s.name, kind: 'MATCH_END', minutesLeft: end, ...extra });
      }
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
      match: { ...match, ...(this.#matchMinutesLeft() !== null ? { minutesLeft: this.#matchMinutesLeft() } : {}) },
      team: p.team ? { code: p.team.code, name: p.team.name } : null,
      endpoints: { start: p.api?.startEndpoint ?? null, submit: p.api?.submissionEndpoint ?? null },
      items: this.#items().map(i => this.#compactItem(i)),
      newItems, trackedStatus: Object.fromEntries([...this.log.backlog].map(([k, v]) => [k, v.status])),
      ...(this.incidents?.size ? { incidents: [...this.incidents.values()].map(e => ({ key: e.key, state: !e.done ? 'PREPARING' : e.result?.error ? 'ERROR' : e.reported ? 'REPORTED' : 'READY', slot: e.result?.slot ?? null })) } : {}),
      ...(this.#hasSlots() ? { slots: this.#slotSummary() } : {})
    };
  }

  #discover() {
    const fresh = [];
    for (const item of this.#items()) {
      if (!item?.key || this.known.has(item.key)) continue;
      this.known.add(item.key);
      this.seenAt.set(item.key, Date.now());
      fresh.push(item.key);
      if (this.cfg.phase === 'GAME') {
        try {
          this.log.append({ type: 'BACKLOG_STATUS', backlogId: item.key, title: this.#title(item.key), status: 'DISCOVERED',
            summary: clip(`${item.backlogType ?? 'ITEM'} revealed${item.deadlineMinutes ? `, deadline ${item.deadlineMinutes} min` : ''}.`),
            revision: null, receiptId: null });
        } catch { /* keep going */ }
        if (INCIDENT_AUTO && isIncident(item)) this.#kickIncident(item.key);
      }
    }
    return fresh;
  }

  // ---------- incident fast path ----------
  /** Starts (once per item) the background preparation of a PI: Start Work in a free slot (s4 first), then every log
   *  page and the incident rules collected into <slotMatchRoot>/.mtm-tmp/<ID>/incident/. Never throws. */
  #kickIncident(key, slotWanted = null) {
    const known = this.incidents.get(key);
    if (known) return known;
    const entry = { key, startedAt: Date.now(), done: false, reported: false, result: null };
    this.incidents.set(key, entry);
    entry.promise = (async () => {
      // Let the #discover pass that found the PI finish first (start_work runs its own discovery).
      await new Promise(r => setImmediate(r));
      const c = this.cfg;
      let slot = null, start = null, startError = null;
      try {
        const all = this.#slots();
        const free = n => all[n] && !all[n].item && existsSync(join(all[n].path ?? '', '.git'));
        slot = slotWanted ?? (free(OWN_SLOT) ? OWN_SLOT : ['s1', 's2', 's3'].find(free) ?? null);
        if (slot && c.apiKey) {
          try { start = await this.startWork({ backlogItemKey: key, slot }); }
          catch (error) { startError = `${error.code ?? 'START_WORK_FAILED'}: ${clip(String(error.message), 160)}`; slot = null; }
        }
        const root = start?.slotMatchRoot ?? c.matchRoot;
        let defs = this.companyToolDefs;
        if (!defs) { try { defs = await this.companyTools(); } catch (error) { defs = []; startError ??= `company tools list failed: ${error.code ?? 'ERROR'}`; } }
        const item = this.#items().find(i => i.key === key) ?? {};
        const summary = await collectIncident({ defs, dir: join(root, SCRATCH, key, 'incident'),
          brief: { key, title: item.title ?? '', description: typeof item.description === 'string' ? item.description : '' },
          call: (name, args) => this.companyCall({ name, arguments: args, backlogId: key }) });
        let brief = null;
        try { brief = start?.briefFile ? JSON.parse(readFileSync(start.briefFile, 'utf8')) : null; } catch { /* optional */ }
        entry.result = { backlogItemKey: key, slot: start ? slot : null, started: Boolean(start), startError,
          worktreeRoot: start?.worktreeRoot ?? null, slotMatchRoot: start?.slotMatchRoot ?? null, briefFile: start?.briefFile ?? null,
          answerFile: brief?.answerFile ?? join(root, 'answers', key, 'submit.json'), validateCommand: brief?.validateCommand ?? null,
          doneFile: start?.doneFile ?? null, deadlineMinutes: item.deadlineMinutes ?? null, minutesLeft: this.#minutesLeft(item), ...summary };
      } catch (error) {
        entry.result = { backlogItemKey: key, slot, started: Boolean(start), error: `${error.code ?? 'ERROR'}: ${clip(String(error.message), 200)}` };
      }
      entry.done = true;
      entry.readyAt = Date.now();
      return entry.result;
    })();
    return entry;
  }

  /** Feed check (skipped within 1 s of a read): on a change, a full read discovers new items (and starts a PI's preparation). */
  async #peekFeed() {
    const c = this.cfg;
    if (!INCIDENT_AUTO || c?.phase !== 'GAME' || Date.now() - (this.projectionAt ?? 0) < 1000) return 'skipped';
    const feed = this.projection?.api?.feedEndpoint;
    if (!feed) return 'skipped';
    try {
      const url = new URL(feed, c.gmOrigin);
      url.searchParams.set('afterSequence', String(this.projection?.match?.currentSequence ?? 0));
      const res = await request(url.href, { allowedOrigins: c.origins, allowLoopback,
        headers: { accept: 'application/json', cookie: cookieHeader(this.jar) } });
      if (res.status === 409 || (res.status === 200 && (res.json?.items?.length ?? 0) > 0)) {
        await this.#getProjection({ log: false });
        this.peekFresh = [...(this.peekFresh ?? []), ...this.lastFresh];
        return 'changed';
      }
      return res.status === 200 ? 'same' : 'error';
    } catch { return 'error'; } // the regular loop below retries
  }

  /** NEW_PI result for the first prepared, unreported incident; waits up to waitMs for one still being prepared. */
  async #incidentUpdate(waitMs, fresh = []) {
    const open = [...this.incidents.values()].filter(e => !e.reported);
    if (!open.length) return null;
    let ready = open.find(e => e.done);
    if (!ready && waitMs > 0) {
      await Promise.race([Promise.race(open.map(e => e.promise)), sleep(waitMs)]);
      ready = open.find(e => e.done);
    }
    if (!ready) return null;
    ready.reported = true;
    return { changed: true, reason: 'NEW_PI', incident: { ...ready.result, preparedInSec: Math.round((ready.readyAt - ready.startedAt) / 1000) }, board: this.#board(fresh) };
  }

  /** Manual trigger (helper restarted after the PI was discovered, or a re-collection with refresh). */
  async prepareIncident({ backlogItemKey, slot = null, refresh = false }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'prepare_incident is only allowed after START_GAME');
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    if (slot !== null && !SLOT_NAME.test(slot)) fail('INVALID_SLOT', 'slot is s1..s5');
    if (!this.projection) await this.#getProjection();
    const prev = this.incidents.get(backlogItemKey);
    // Collect again on request, or when the PI could not be started earlier (no free slot then).
    if (prev && prev.done && (refresh || !prev.result?.started)) {
      this.incidents.delete(backlogItemKey);
      const s = this.#slotOf(backlogItemKey);
      slot = s?.name ?? slot;
    }
    const entry = this.#kickIncident(backlogItemKey, slot);
    await entry.promise;
    entry.reported = true;
    return { ...entry.result, preparedInSec: Math.round((entry.readyAt - entry.startedAt) / 1000) };
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

  async waitForUpdate({ timeoutMs = 240000, noWait = false } = {}) {
    const c = this.#need();
    // The loop returns within ~5 s of any change (new item, status, SLOT_DONE), so a shorter wait only adds idle model
    // turns that re-send the whole context (7GAZA14X: a 60 s wait plus a status line every minute while workers ran).
    // Always block up to 240 s; timeoutMs is accepted for compatibility and ignored. A deadline (or the match end)
    // 3 minutes away for a busy item wakes the orchestrator once (DEADLINE_SOON), so the safety net needs no timer.
    // Exception: within 5 minutes after a DEADLINE_SOON a shorter timeoutMs is honoured, so the safety net can wait
    // ~60 s for the worker's DONE.json and still integrate before the deadline.
    const t = Number(timeoutMs);
    const ms = Date.now() < (this.soonUntil ?? 0) && Number.isFinite(t) ? Math.min(Math.max(t, 5000), 240000) : 240000;
    // noWait: one pass without sleeping (the orchestrator checks for events between steps of its own item in s4).
    const deadline = noWait ? Date.now() : Date.now() + ms;
    if (!this.projection) await this.#getProjection();
    const before = this.signature ?? this.#signature();
    let lastFull = Date.now();
    let once = noWait;
    while (once || Date.now() < deadline) {
      once = false;
      // A PI outranks everything else (race for 100/90/75/60 %): its data is ready before the orchestrator wakes.
      // Before reporting anything, a cheap feed check discovers an item revealed since the last read.
      const peek = await this.#peekFeed();
      const pi = await this.#incidentUpdate(90000, this.peekFresh ?? []);
      if (pi) { this.peekFresh = []; return pi; }
      const done = this.#newSlotResults();
      if (done.length) return { changed: true, reason: 'SLOT_DONE', slotDone: done, board: this.#board([]) };
      const finished = this.#jobsFinished();
      if (finished.length) return { changed: true, reason: 'JOBS_DONE', jobs: finished, board: this.#board([]) };
      const soon = this.#deadlineSoon();
      if (soon.length) { this.soonUntil = Date.now() + 300000; return { changed: true, reason: 'DEADLINE_SOON', deadlineSoon: soon, board: this.#board([]) }; }
      const status = this.projection?.match?.status;
      if (status && !['IN_PROGRESS', 'PREPARING', 'PREPARED', 'READY'].includes(status)) {
        return { changed: true, reason: `MATCH_${status}`, board: this.#board([]) };
      }
      let wait = 5000;
      try {
        const feed = this.projection?.api?.feedEndpoint;
        // A change the peek above already read is compared below; a quiet peek replaces this iteration's feed request.
        let full = peek === 'changed' || Date.now() - lastFull > 30000 || !feed;
        if (!full && peek !== 'same') {
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
          const fresh = [...(this.peekFresh ?? []), ...this.lastFresh];
          this.peekFresh = [];
          const sig = this.#signature();
          if (sig !== before) {
            this.signature = sig;
            await this.#getProjection(); // logged read for the change that matters
            fresh.push(...this.lastFresh);
            const now = this.projection?.match?.status;
            const reason = now && now !== status && !['IN_PROGRESS', 'PREPARING', 'PREPARED', 'READY'].includes(now) ? `MATCH_${now}` : 'MATCH_UPDATED';
            if (reason === 'MATCH_UPDATED') { const pi = await this.#incidentUpdate(90000, fresh); if (pi) return pi; }
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

  /** Test counts of an item = its template test-case rows (TC-01..n), taken from the committed answer.
   *  Extra checks a worker ran (existing suite, typecheck, build, own scripts) are never counted as test cases. */
  #rowTests(answer) {
    const rows = Array.isArray(answer?.testResults) ? answer.testResults : [];
    if (!rows.length) return null;
    const res = r => String(r?.result ?? '').toUpperCase();
    const passed = rows.filter(r => res(r) === 'PASS' || res(r) === 'PASSED').length;
    const failed = rows.filter(r => res(r) === 'FAIL' || res(r) === 'FAILED').length;
    if (!passed && !failed) return { required: rows.length, executed: 0, passed: 0, failed: 0, skipped: 0, summary: `0/${rows.length} test cases run.` };
    const skipped = rows.length - passed - failed;
    return { required: rows.length, executed: rows.length, passed, failed, skipped,
      summary: `${passed}/${rows.length} test cases passed${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} not run` : ''}.` };
  }

  /** Final BACKLOG_TESTS event from the counts the agent observed; rejects impossible counts. */
  #logTests(key, tests) {
    const n = k => Number.isSafeInteger(tests?.[k]) && tests[k] >= 0 ? tests[k] : null;
    const counts = { required: n('required'), executed: n('executed'), passed: n('passed'), failed: n('failed'), skipped: n('skipped') ?? 0 };
    if (Object.values(counts).some(v => v === null)) fail('INVALID_TEST_COUNTS', 'tests needs integer required, executed, passed, failed (skipped optional)');
    const status = counts.failed > 0 ? 'FAILED' : counts.executed === 0 ? 'NOT_RUN' : 'PASSED';
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
    // When the answer has test-case rows they decide the counts; `tests` is used only for items without rows.
    const counted = this.#rowTests(answer) ?? tests ?? null;
    const testStatus = counted ? this.#logTests(backlogItemKey, counted) : null;
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
      return { status: 'SUBMITTED', receipt, gitRevision: full, evidence, schemaChecked, changedTests, testStatus, tests: counted, board };
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
    return Object.values(this.#slots()).map(s => ({ slot: s.name, role: s.name === OWN_SLOT ? 'orchestrator' : s.name === HEAVY_SLOT ? 'heavy-worker' : 'worker', item: s.item ?? null, state: s.item ? s.state : 'FREE' }));
  }
  #slotOf(key) { return Object.values(this.#slots()).find(s => s.item === key) ?? null; }

  async prepareSlots({ count = 2, copyFiles = [] } = {}) {
    const c = this.#need();
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 5) fail('INVALID_SLOT_COUNT', 'count must be 1..5 (s1-s3 for the 3 workers, s4 for the orchestrator itself, s5 for the heavy worker)');
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
    if (!SLOT_NAME.test(name ?? '')) fail('INVALID_SLOT', 'slot is s1, s2, s3 (workers), s4 (orchestrator) or s5 (heavy worker)');
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
    // A reused slot (next item of a group) must not hold commits that never reached the assigned branch.
    // Accepted tips: already on the branch (fresh slot) or the last integrated/abandoned tip.
    const tip = (await git(s.path, ['rev-parse', 'HEAD'])).stdout.trim();
    if (SHA.test(tip) && tip !== s.integratedTip && (await git(c.checkoutRoot, ['merge-base', '--is-ancestor', tip, head])).code !== 0) {
      fail('SLOT_HAS_UNINTEGRATED_WORK', `${s.name} holds commits that are not on ${c.repository.branch}; integrate them or release_slot first`);
    }
    await gitOk(s.path, ['checkout', '-f', '-B', s.branch, head]);
    await gitOk(s.path, ['clean', '-fdq']); // untracked leftovers only; ignored files (deps, env) stay
    const all = this.#slots();
    all[s.name] = { ...all[s.name], item: key, state: 'BUSY', base: head, integratedTip: null, reported: null, startedAt: new Date().toISOString() };
    this.#saveSlots(all);
  }

  async #writeSlotBrief(s, key, r, submitPath, required) {
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
      validateCommand: `node "${join(dir, 'validate.mjs')}"`, doneFile: join(dir, 'DONE.json'),
      baselineRepair: this.#baselineInfo(),
      // Background jobs started during preparation (slot install, baseline run) may still be running at game start.
      // Wall-clock limits for a worker that budgets its own time (heavy items, partial submission).
      heavy: isHeavy(item), ...this.#timeLimits(item),
      // The other revealed items, so a worker can tell a defect another item owns from one nobody owns.
      otherItems: this.#items().filter(i => i.key !== key).map(i => ({ key: i.key, title: i.title ?? null })),
      jobsDir: this.#jobsDir(), slotInstallJob: `install-${s.name}`, slotInstallState: this.#jobsDir() ? jobState(this.#jobsDir(), `install-${s.name}`).state : null };
    writeFileSync(join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
    try { await this.#publishProxy(s.matchRoot); } catch { /* workers fall back to the orchestrator's saved files */ }
    const map = join(c.matchRoot, SCRATCH, 'repo-map.md');
    if (existsSync(map)) copyFileSync(map, join(s.matchRoot, SCRATCH, 'repo-map.md'));
    // Ready-made run/evidence scripts the scout verified during preparation (e.g. serve.mjs, shot.mjs).
    const tools = join(c.matchRoot, SCRATCH, 'tools');
    if (existsSync(tools)) cpSync(tools, join(s.matchRoot, SCRATCH, 'tools'), { recursive: true });
    return { backlogId: key, backlogType: brief.backlogType, title: item?.title ?? null, replay: r.replay ?? null,
      slot: s.name, slotIndex: s.index, worktreeRoot: s.path, slotMatchRoot: s.matchRoot, briefFile: join(dir, 'brief.json'),
      doneFile: brief.doneFile, requiredTestCases: required, deadlineMinutes: item?.deadlineMinutes ?? null, heavy: brief.heavy,
      slotInstallState: brief.slotInstallState };
  }

  /** ISO times when the item's deadline and the match end are reached (null when unknown). */
  #timeLimits(item) {
    const at = min => (min === null || min === undefined ? null : new Date(Date.now() + min * 60000).toISOString());
    const end = this.#matchMinutesLeft();
    const dl = this.#minutesLeft(item);
    const stop = [dl, end].filter(v => v !== null && v !== undefined);
    return { deadlineAt: at(dl), matchEndsAt: at(end), stopBy: stop.length ? at(Math.min(...stop)) : null };
  }

  /** <matchRoot>/.mtm-tmp/jobs when preparation started background jobs there, else null. */
  #jobsDir() {
    const d = this.cfg?.matchRoot ? join(this.cfg.matchRoot, SCRATCH, 'jobs') : null;
    return d && existsSync(d) ? d : null;
  }

  /** Background jobs that finished (DONE / FAILED / LOST) since the last report, each reported once. */
  #jobsFinished() {
    const d = this.#jobsDir();
    if (!d || this.cfg?.phase !== 'GAME') return [];
    this.jobsReported ??= new Set();
    const out = [];
    let names = [];
    try { names = readdirSync(d).filter(f => f.endsWith('.pid') && !f.startsWith('prep-')).map(f => f.slice(0, -4)); } catch { return []; } // prep-* jobs were awaited during preparation
    for (const n of names) {
      const st = jobState(d, n);
      if (st.state === 'RUNNING' || this.jobsReported.has(`${n}:${st.state}`)) continue;
      this.jobsReported.add(`${n}:${st.state}`);
      let tail = '';
      try { tail = readFileSync(join(d, `${n}.log`), 'utf8').slice(-3000).split(/\r?\n/).filter(l => l.trim()).slice(st.state === 'DONE' ? -2 : -8).join('\n'); } catch { /* no log */ }
      out.push({ name: n, state: st.state, exit: st.exit, tail: clip(tail, 600) });
    }
    return out;
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

  /**
   * Value answers in one call (PI, TASK questions: no source change). Fills the item's template with `values` (only
   * keys the template has), the record object, evidence files; validates; commits answers/<ID> in the item's slot;
   * writes DONE.json; with integrate: true also integrates and submits (orchestrator only).
   */
  async answerItem({ backlogItemKey, values = {}, record = null, evidence = {}, status = 'DONE', integrate = false }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'answer_item is only allowed after START_GAME');
    const key = backlogItemKey;
    if (!KEY.test(key ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    const s = this.#slotOf(key);
    if (!s) fail('NOT_IN_SLOT', `${key} is not started in a slot: start_work first`);
    const answerDir = join(s.matchRoot, 'answers', key);
    const submitPath = join(answerDir, 'submit.json');
    let tpl;
    try { tpl = JSON.parse(readFileSync(submitPath, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { fail('NO_TEMPLATE', `answers/${key}/submit.json is missing or not JSON: ${clip(String(error.message), 120)}`); }
    const unknown = Object.keys(values ?? {}).filter(k => !(k in tpl));
    if (unknown.length) fail('UNKNOWN_FIELD', `not in the template: ${unknown.join(', ')}; template fields: ${Object.keys(tpl).join(', ')}`);
    const answer = { ...tpl, ...values };
    if (record && typeof record === 'object') {
      const rk = Object.keys(tpl).find(k => /record$/i.test(k) && tpl[k] && typeof tpl[k] === 'object' && !Array.isArray(tpl[k]));
      if (!rk) fail('NO_RECORD_FIELD', 'the template has no *Record object');
      answer[rk] = { ...tpl[rk], ...record };
    }
    mkdirSync(join(answerDir, 'evidence'), { recursive: true });
    const refs = [];
    for (const [name, content] of Object.entries(evidence ?? {})) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(name)) fail('INVALID_EVIDENCE_NAME', `evidence file name ${name}`);
      const target = join(answerDir, 'evidence', name);
      if (content && typeof content === 'object' && typeof content.from === 'string') {
        const from = normalize(resolve(content.from));
        if (!within(s.matchRoot, from) || !existsSync(from)) fail('INVALID_EVIDENCE_SOURCE', `${name}: from must be an existing file inside the slot`);
        copyFileSync(from, target);
      }
      else writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      refs.push(`evidence/${name}`);
    }
    if (Array.isArray(answer.evidenceFiles)) answer.evidenceFiles = [...new Set([...answer.evidenceFiles, ...refs])];
    if ('status' in tpl) answer.status = status;
    writeFileSync(submitPath, JSON.stringify(answer, null, 2) + '\n');
    const check = answerProblems(this.#submitSchema(key), answer, ref => existsSync(join(answerDir, ref)));
    if (check.problems.length) return { status: 'INVALID', answerFile: submitPath, problems: check.problems.slice(0, 20) };
    await gitOk(s.path, ['add', '--', answerDir]);
    const staged = (await gitOk(s.path, ['diff', '--cached', '--name-only'])).trim();
    if (staged) await gitOk(s.path, ['commit', '-q', '-m', `${key}: answer`]);
    const rows = Array.isArray(answer.testResults) ? answer.testResults : [];
    const tests = rows.length
      ? { required: rows.length, executed: rows.filter(r => r.result !== 'NOT_RUN').length, passed: rows.filter(r => r.result === 'PASS').length,
          failed: rows.filter(r => r.result === 'FAIL').length, skipped: rows.filter(r => r.result === 'NOT_RUN').length }
      : { required: 0, executed: 1, passed: 1, failed: 0, skipped: 0 };
    const doneFile = join(s.matchRoot, SCRATCH, key, 'DONE.json');
    mkdirSync(dirname(doneFile), { recursive: true });
    writeFileSync(doneFile, JSON.stringify({ status: status === 'DONE' ? 'DONE' : 'PARTIAL', summary: 'answer written by answer_item', tests }, null, 2));
    const out = { status: 'ANSWERED', answerFile: submitPath, committed: Boolean(staged), doneFile, tests };
    if (integrate) out.integration = await this.integrateItem({ backlogItemKey: key, tests });
    return out;
  }

  async integrateItem({ backlogItemKey, tests, acknowledgeTestChanges, allowUncommitted = false, next = null }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'integrate_item is only allowed after START_GAME');
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    const s = this.#slotOf(backlogItemKey);
    if (!s) fail('ITEM_NOT_IN_SLOT', `${backlogItemKey} is not assigned to a slot`);
    if (!tests) {
      // Only used when the answer has no test-case rows (submit_work counts the rows otherwise).
      const f = join(s.matchRoot, SCRATCH, backlogItemKey, 'DONE.json');
      try { tests = JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')).tests; } catch { /* optional */ }
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
    const out = { ...result, slot: s.name, integratedCommits: commits.length };
    // Group chaining: start the next item of this worker's group in the same slot (reset to the new branch head).
    if (next && (result.status === 'SUBMITTED' || result.status === 'ALREADY_SUBMITTED_LOCALLY')) {
      try { out.next = await this.startWork({ backlogItemKey: next, slot: s.name }); }
      catch (error) { out.nextError = { code: error.code ?? 'START_WORK_FAILED', message: String(error.message).slice(0, 300) }; }
    }
    return out;
  }

  #releaseSlot(name, key) {
    const all = this.#slots();
    all[name] = { ...all[name], item: null, lastItem: key, state: 'FREE', reported: null };
    this.#saveSlots(all);
  }

  /** Commits the baseline repair the scout prepared and tested during preparation (a git-ignored patch), as part
   *  of an item that has been started, before workers branch: every slot then starts from a green suite. */
  async applyBaseline({ backlogItemKey, summary = '' }) {
    const c = this.#need();
    if (c.phase !== 'GAME') fail('NOT_IN_GAME', 'apply_baseline is only allowed after START_GAME');
    if (!KEY.test(backlogItemKey ?? '')) fail('INVALID_BACKLOG_KEY', 'invalid backlogItemKey');
    if (!existsSync(join(this.#stateDir(), `${backlogItemKey}.start.json`))) fail('NOT_STARTED', `start_work ${backlogItemKey} first (no edit before Start Work)`);
    const stateFile = join(this.#stateDir(), 'baseline.json');
    if (existsSync(stateFile)) return { status: 'ALREADY_APPLIED', ...JSON.parse(readFileSync(stateFile, 'utf8')) };
    const patch = join(c.matchRoot, SCRATCH, 'baseline', 'baseline.patch');
    if (!existsSync(patch)) fail('NO_BASELINE_PATCH', `${patch} does not exist; use the baseline-owner rule instead`);
    const text = readFileSync(patch, 'utf8');
    if ([c.password, c.apiKey].some(v => v && v.length >= 4 && text.includes(v))) fail('SECRET_IN_DIFF', 'the baseline patch contains a credential value');
    const cur = (await gitOk(c.checkoutRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    if (cur !== c.repository.branch) fail('BRANCH_MISMATCH', `checkoutRoot is on ${cur}, not ${c.repository.branch}`);
    if ((await gitOk(c.checkoutRoot, ['status', '--porcelain', '--untracked-files=no'])).trim()) fail('MAIN_DIRTY', 'checkoutRoot has uncommitted tracked changes');
    const numstat = await git(c.checkoutRoot, ['apply', '--numstat', patch]);
    if (numstat.code !== 0) fail('BASELINE_PATCH_INVALID', clip(numstat.stderr, 300));
    const files = numstat.stdout.split(/\r?\n/).filter(Boolean).map(l => l.split('\t').pop());
    const outside = files.filter(f => !f.startsWith(`${c.repository.folder}/`) || f.includes(`/${SCRATCH}/`));
    if (!files.length || outside.length) fail('OUTSIDE_FOLDER', 'the baseline patch must change files inside the assigned folder only', { files: outside.slice(0, 10) });
    const tracked = new Set((await gitOk(c.checkoutRoot, ['ls-files', '--', c.repository.folder])).split(/\r?\n/).filter(Boolean));
    const testsTouched = files.filter(f => tracked.has(f) && TEST_PATH.test(f));
    if (testsTouched.length) fail('EXISTING_TESTS_MODIFIED', 'the baseline patch changes existing tests; baseline repairs fix code, not tests (use the baseline-owner rule if a test really is wrong)', { files: testsTouched.slice(0, 10) });
    const pull = await git(c.checkoutRoot, ['pull', '--rebase', '--no-tags', 'origin', c.repository.branch], { timeoutMs: 180000 });
    if (pull.code !== 0) { await git(c.checkoutRoot, ['rebase', '--abort']); fail('GIT_PULL_FAILED', clip(pull.stderr, 300)); }
    const applied = await git(c.checkoutRoot, ['apply', '--index', '--whitespace=nowarn', patch]);
    if (applied.code !== 0) fail('BASELINE_PATCH_DOES_NOT_APPLY', clip(applied.stderr, 300));
    const msg = `${backlogItemKey}: baseline repair${summary ? ` - ${clip(String(summary).replace(/[\r\n]+/g, ' '), 120)}` : ''}`;
    const commit = await git(c.checkoutRoot, ['-c', 'core.safecrlf=false', 'commit', '-q', '-m', msg]);
    if (commit.code !== 0) { await git(c.checkoutRoot, ['reset', '-q', '--hard', 'HEAD']); fail('GIT_COMMIT_FAILED', clip(commit.stderr, 300)); }
    let push = await git(c.checkoutRoot, ['push', 'origin', `HEAD:refs/heads/${c.repository.branch}`], { timeoutMs: 180000 });
    if (push.code !== 0) {
      const again = await git(c.checkoutRoot, ['pull', '--rebase', '--no-tags', 'origin', c.repository.branch], { timeoutMs: 180000 });
      if (again.code !== 0) { await git(c.checkoutRoot, ['rebase', '--abort']); fail('GIT_PULL_FAILED', clip(again.stderr, 300)); }
      push = await git(c.checkoutRoot, ['push', 'origin', `HEAD:refs/heads/${c.repository.branch}`], { timeoutMs: 180000 });
      if (push.code !== 0) fail('GIT_PUSH_FAILED', clip(push.stderr, 300));
    }
    const sha = (await gitOk(c.checkoutRoot, ['rev-parse', 'HEAD'])).trim();
    // Slots started before this commit and not yet worked on move up to it (their untracked answer folders stay).
    const synced = [];
    const all = this.#slots();
    for (const sl of Object.values(all)) {
      if (!existsSync(join(sl.path ?? '', '.git'))) continue;
      const tip = (await git(sl.path, ['rev-parse', 'HEAD'])).stdout.trim();
      const dirty = (await git(sl.path, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim();
      if (dirty || (sl.item && tip !== sl.base) || (await git(c.checkoutRoot, ['merge-base', '--is-ancestor', tip, sha])).code !== 0) continue;
      if ((await git(sl.path, ['checkout', '-f', '-B', sl.branch, sha])).code === 0) { all[sl.name] = { ...all[sl.name], base: sha }; synced.push(sl.name); }
    }
    this.#saveSlots(all);
    const record = { sha, item: backlogItemKey, files, summary: clip(String(summary || ''), 200), syncedSlots: synced };
    writeFileSync(stateFile, JSON.stringify(record, null, 2));
    return { status: 'APPLIED', ...record };
  }

  #baselineInfo() {
    try { return JSON.parse(readFileSync(join(this.cfg.checkoutRoot, '.git', 'mtm', 'baseline.json'), 'utf8')); } catch { return null; }
  }

  /** Frees a slot without submitting (item abandoned, or submitted another way). */
  async releaseSlot({ slot }) {
    this.#need();
    if (!SLOT_NAME.test(slot ?? '') || !this.#slots()[slot]) fail('INVALID_SLOT', 'unknown slot');
    const all = this.#slots();
    const key = all[slot].item;
    this.#releaseSlot(slot, key);
    // An abandoned slot's commits are deliberately dropped at the next start_work.
    const tip = await git(all[slot].path, ['rev-parse', 'HEAD']);
    const after = this.#slots();
    after[slot] = { ...after[slot], integratedTip: tip.stdout.trim() || null };
    this.#saveSlots(after);
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

  /** Starts (once) the loopback relay for workers and writes its port/token into <dir>/.mtm-tmp/. */
  async #publishProxy(dir) {
    const c = this.cfg;
    if (!c?.apiKey || c.phase !== 'GAME') return;
    this.proxy ??= await startCompanyProxy(this);
    mkdirSync(join(dir, SCRATCH), { recursive: true });
    writeFileSync(join(dir, SCRATCH, PROXY_FILE), JSON.stringify({ port: this.proxy.port, token: this.proxy.token, pid: process.pid }));
    // Tool definitions (names, parameters, paging) so workers need no list call of their own.
    if (this.companyToolDefs) writeFileSync(join(dir, SCRATCH, 'company-tools.json'), JSON.stringify(this.companyToolDefs, null, 2));
  }

  async companyTools({ slotMatchRoot } = {}) {
    if (!this.cfg?.apiKey && slotMatchRoot) return relayCompany(slotMatchRoot, { op: 'list' });
    const tools = await this.#companyClient().listTools();
    this.companyToolDefs = tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    return this.companyToolDefs;
  }

  async companyCall({ name, arguments: args = {}, backlogId = null, saveToSlot = false, slotMatchRoot = null }) {
    if (!this.cfg?.apiKey && slotMatchRoot) {
      // Worker helper: relay through the orchestrator helper; long answers go to a file the worker reads in slices.
      const r = await relayCompany(slotMatchRoot, { op: 'call', name, arguments: args, backlogId });
      const text = String(r?.text ?? '');
      const bid = backlogId && KEY.test(backlogId) ? backlogId : '_shared';
      if (!saveToSlot && text.length <= 6000) return r;
      const dir = join(slotMatchRoot, SCRATCH, bid);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `company-${String(name).replace(/[^A-Za-z0-9_.-]/g, '_')}-${Date.now()}.txt`);
      writeFileSync(file, text + (r?.structuredContent ? `\n\nstructuredContent:\n${JSON.stringify(r.structuredContent, null, 2)}` : ''));
      return { isError: r?.isError ?? false, savedTo: file, chars: text.length, head: clip(text.replace(/\s+/g, ' '), 300) };
    }
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
