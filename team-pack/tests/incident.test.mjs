// Incident fast path: the helper starts a revealed PI in a free slot and collects every log page and the incident
// rules by code (P2XQMD8T: PI-01 correct but second, -16 points).
// Run: node --test tests/incident.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockGm } from './mock-gm.mjs';
import { collectIncident, pickTools } from '../src/incident.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packRoot = join(here, '..');
const fixture = JSON.parse(readFileSync(join(here, 'fixtures', 'pi-incident.json'), 'utf8'));
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_EDITOR: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const TOOLS = [
  { name: 'kb_search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', maximum: 10 } }, required: ['query'] } },
  { name: 'search_logs', inputSchema: { type: 'object', properties: { query: { type: 'string' }, service: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer', maximum: 20 } } } }
];
const PI = { key: 'PI-01', backlogType: 'PI', title: 'Clients receive payment reminders for invoices they already paid', deadlineMinutes: 15,
  revealedElapsedSec: 720, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'Investigate rootCauseRelease, rootCauseComponent, containmentFlag, affectedInvoices.' };

function fakeCall(logs, kb, calls) {
  return async (name, a) => {
    calls.push([name, a]);
    if (name === 'search_logs') {
      const hit = logs.filter(e => !a.service || e.service === a.service);
      const off = a.offset ?? 0, lim = Math.min(a.limit ?? 20, 20);
      return { text: JSON.stringify({ total: hit.length, returned: hit.slice(off, off + lim).length, entries: hit.slice(off, off + lim) }) };
    }
    const q = String(a.query).toLowerCase().split(/\s+/);
    return { text: JSON.stringify({ mode: 'search', articles: kb.filter(k => q.some(t => `${k.id} ${k.title} ${k.body}`.toLowerCase().includes(t))) }) };
  };
}

test('tool detection: paging and filters come from the listed input schema', () => {
  const t = pickTools(TOOLS);
  assert.equal(t.logTool.name, 'search_logs'); assert.equal(t.kbTool.name, 'kb_search');
  assert.deepEqual([t.offsetKey, t.limitKey, t.limitMax, t.serviceKey, t.queryKey], ['offset', 'limit', 20, 'service', 'query']);
});

test('collectIncident pages every log entry and fetches the incident rules', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mld-incident-'));
  try {
    const calls = [];
    const r = await collectIncident({ call: fakeCall(fixture.logs, fixture.kb, calls), defs: TOOLS, dir: join(dir, 'incident'), brief: PI });
    assert.equal(r.logEntries, fixture.logs.length, '57 entries over 3 pages');
    assert.equal(r.complete, true);
    assert.deepEqual(r.coverage[0], { args: {}, total: 57, collected: 57, complete: true });
    assert.equal(calls.filter(c => c[0] === 'search_logs').length, 3, 'one unfiltered query, 3 pages of 20');
    assert.ok(r.kbArticles.includes('KB-OPS-01') && r.kbArticles.includes('KB-AR-05'), r.kbArticles.join());
    const digest = readFileSync(r.files.digest, 'utf8');
    for (const s of ['rel-20261027-2', 'reminders.statusFromCache', 'INV-MLD-1106', 'reminder-worker', 'KB-OPS-01']) assert.ok(digest.includes(s), s);
    const ent = JSON.parse(readFileSync(r.files.entities, 'utf8'));
    assert.ok(ent['INV-MLD-1106'].some(e => e.service === 'payment-api') && ent['INV-MLD-1106'].some(e => e.service === 'reminder-worker'));
    const logs = JSON.parse(readFileSync(r.files.logs, 'utf8'));
    assert.ok(logs.every((e, i) => i === 0 || logs[i - 1].ts <= e.ts), 'sorted by time');
    assert.match(readFileSync(r.files.kb, 'utf8'), /root-cause release is the first release/);
    assert.ok(digest.length < 12000, `digest ${digest.length} chars`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a tool that needs a filter is queried per service and a capped page is reported incomplete', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mld-incident-'));
  try {
    const defs = [TOOLS[0], { name: 'search_logs', inputSchema: { type: 'object', properties: { service: { type: 'string' }, offset: { type: 'integer' } }, required: ['service'] } }];
    const r = await collectIncident({ call: fakeCall(fixture.logs, fixture.kb, []), defs, dir, brief: PI });
    assert.equal(r.logEntries, fixture.logs.length, 'all services found');
    const broken = async (name, a) => name === 'search_logs'
      ? { text: JSON.stringify({ total: 57, returned: 20, entries: fixture.logs.slice(0, 20) }) } // ignores offset
      : { text: JSON.stringify({ articles: [] }) };
    const r2 = await collectIncident({ call: broken, defs: TOOLS, dir: join(dir, 'b'), brief: PI, maxCalls: 30 });
    assert.equal(r2.complete, false);
    assert.match(readFileSync(r2.files.digest, 'utf8'), /NO \(paging stopped at 40 of 57\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- through the MCP helper ----------
let gm, tmp, prepare, start, matchRoot;
class Helper {
  constructor() {
    this.child = spawn(process.execPath, [join(packRoot, 'bin', 'runtime-server.mjs')],
      { env: { ...process.env, MTM_HELPER_ALLOW_LOOPBACK: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
    this.next = 1; this.pending = new Map(); this.buf = '';
    this.child.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const msg = JSON.parse(this.buf.slice(0, i)); this.buf = this.buf.slice(i + 1);
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
  }
  rpc(method, params) {
    const id = this.next++;
    return new Promise(r => { this.pending.set(id, r); this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  }
  async call(name, args = {}) {
    const msg = await this.rpc('tools/call', { name, arguments: args });
    const payload = JSON.parse(msg.result.content[0].text);
    return msg.result.isError ? { error: payload.error } : payload;
  }
  close() { this.child.stdin.end(); this.child.kill(); }
}

before(async () => {
  gm = await startMockGm({ matchId: 'PIFA0001' });
  gm.state.company = { logs: fixture.logs, kb: fixture.kb };
  tmp = mkdtempSync(join(tmpdir(), 'mld-incident-helper-'));
  const ws = join(tmp, 'ws');
  const bare = join(tmp, 'remote.git');
  g(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  const seed = join(tmp, 'seed');
  g(tmp, 'clone', '-q', bare, seed);
  mkdirSync(join(seed, gm.matchId, 'src'), { recursive: true });
  writeFileSync(join(seed, gm.matchId, 'src', 'app.txt'), 'x\n');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed');
  g(seed, 'push', '-q', 'origin', 'main');
  const checkoutRoot = join(ws, 'matches', gm.matchId);
  matchRoot = join(checkoutRoot, gm.matchId);
  mkdirSync(join(ws, 'team-sdlc-pack', 'logs'), { recursive: true });
  g(tmp, 'clone', '-q', bare, checkoutRoot);
  g(checkoutRoot, 'config', 'user.name', 'MLD'); g(checkoutRoot, 'config', 'user.email', 'mld@example.invalid');
  const logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-pi', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-pi', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-pi', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { ...prepare, type: 'START_GAME', requestId: 'start-pi', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
    apiKeySecret: gm.apiKey, apiKeyLength: Buffer.byteLength(gm.apiKey), apiKeySha256: createHash('sha256').update(gm.apiKey).digest('hex'),
    apiKeyScopes: ['backlogs:start', 'submissions:create'], gameMasterUrl: `${gm.origin}/`, allowedApiOrigins: [gm.origin],
    teamWorkspace: ws, challengeWorkspace: join(ws, 'matches'), environmentRevision: g(checkoutRoot, 'rev-parse', 'HEAD') };
  delete start.username; delete start.password;
});

after(async () => { await gm?.close?.(); rmSync(tmp, { recursive: true, force: true }); });

test('a revealed PI is started in s4 and its data collected before the orchestrator wakes; NEW_PI outranks SLOT_DONE', async () => {
  gm.state.backlog = [{ key: 'BUG-07', backlogType: 'BUG', title: 'Layout', deadlineMinutes: null, revealedElapsedSec: 0, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' }];
  gm.state.clock = { elapsedSec: 700, remainingSec: 1700 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    await h.call('prepare_slots', { count: 4 });
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    const s1 = await h.call('start_work', { backlogItemKey: 'BUG-07', slot: 's1' });
    // The worker finishes BUG-07 at the same moment PI-01 appears: the PI comes first.
    writeFileSync(s1.doneFile, JSON.stringify({ status: 'DONE', summary: 'done', tests: { required: 1, executed: 1, passed: 1 } }));
    gm.reveal(PI);
    gm.reveal({ key: 'CR-04', backlogType: 'CR', title: 'Aging', deadlineMinutes: null, revealedElapsedSec: 720, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    await new Promise(r => setTimeout(r, 1200)); // the last match read is older than the peek interval
    const t0 = Date.now();
    const w = await h.call('wait_for_update', {});
    assert.equal(w.reason, 'NEW_PI', JSON.stringify(w).slice(0, 400));
    assert.ok(Date.now() - t0 < 20000, `took ${Date.now() - t0} ms`);
    const inc = w.incident;
    assert.equal(inc.backlogItemKey, 'PI-01'); assert.equal(inc.slot, 's4'); assert.equal(inc.started, true);
    assert.ok(gm.state.started.has('PI-01'), 'Start Work sent by the helper');
    assert.equal(inc.logEntries, fixture.logs.length); assert.equal(inc.complete, true);
    for (const f of Object.values(inc.files)) assert.ok(existsSync(f), f);
    assert.ok(inc.files.digest.startsWith(inc.slotMatchRoot), 'data lives in the slot');
    assert.ok(existsSync(inc.answerFile) && existsSync(inc.briefFile));
    assert.match(inc.validateCommand, /validate\.mjs/);
    assert.equal(inc.deadlineMinutes, 15);
    assert.ok(w.board.incidents.some(i => i.key === 'PI-01' && i.state === 'REPORTED'));
    assert.deepEqual(w.board.newItems.sort(), ['CR-04', 'PI-01'], 'items revealed with the PI are still listed as new');
    // Then the worker's result, and the PI is never reported twice.
    const w2 = await h.call('wait_for_update', {});
    assert.equal(w2.reason, 'SLOT_DONE');
    // Manual trigger returns the same prepared data without collecting again.
    const before = gm.state.companyCalls;
    const again = await h.call('prepare_incident', { backlogItemKey: 'PI-01' });
    assert.equal(again.slot, 's4'); assert.equal(gm.state.companyCalls, before);
    const fresh = await h.call('prepare_incident', { backlogItemKey: 'PI-01', refresh: true });
    assert.equal(fresh.slot, 's4'); assert.ok(gm.state.companyCalls > before, 'refresh collects again');
  } finally { h.close(); }
});

test('with every slot busy the PI is not started but its data is still collected (main scratch folder)', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    for (const k of ['BUG-08', 'BUG-10']) gm.reveal({ key: k, backlogType: 'BUG', title: k, deadlineMinutes: null, revealedElapsedSec: 0, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    await h.call('refresh_match');
    await h.call('start_work', { backlogItemKey: 'BUG-08', slot: 's2' });
    await h.call('start_work', { backlogItemKey: 'BUG-10', slot: 's3' });
    gm.reveal({ ...PI, key: 'PI-03' });
    const w = await h.call('wait_for_update', {});
    assert.equal(w.reason, 'NEW_PI', JSON.stringify(w).slice(0, 300));
    assert.equal(w.incident.backlogItemKey, 'PI-03');
    assert.equal(w.incident.slot, null); assert.equal(w.incident.started, false);
    assert.ok(!gm.state.started.has('PI-03'));
    assert.ok(w.incident.files.digest.startsWith(join(matchRoot, '.mtm-tmp', 'PI-03')), w.incident.files.digest);
    assert.equal(w.incident.logEntries, fixture.logs.length);
    // A slot frees: prepare_incident now starts the PI there and collects again.
    await h.call('release_slot', { slot: 's3' });
    const later = await h.call('prepare_incident', { backlogItemKey: 'PI-03' });
    assert.equal(later.slot, 's3'); assert.equal(later.started, true); assert.ok(gm.state.started.has('PI-03'));
    assert.ok(later.files.digest.includes('.slots'), later.files.digest);
    // Ordinary items are still reported as before, with newItems, even when the feed peek read them first.
    gm.reveal({ key: 'CR-05', backlogType: 'CR', title: 'Export', deadlineMinutes: null, revealedElapsedSec: 0, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    await new Promise(r => setTimeout(r, 1200));
    const w2 = await h.call('wait_for_update', {});
    assert.equal(w2.reason, 'MATCH_UPDATED'); assert.deepEqual(w2.board.newItems, ['CR-05']);
  } finally { h.close(); }
});

test('heavy items: flagged on the board from the title prefix; the brief carries heavy and stopBy', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    gm.state.clock = { elapsedSec: 1500, remainingSec: 900 };
    gm.reveal({ key: 'CR-09', backlogType: 'CR', title: '[Heavy Task] Rebuild the reporting module', deadlineMinutes: null, revealedElapsedSec: 1500, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    gm.reveal({ key: 'CR-10', backlogType: 'CR', title: 'Heavy rain icon on the dashboard', deadlineMinutes: null, revealedElapsedSec: 1500, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    const board = await h.call('refresh_match');
    assert.equal(board.items.find(i => i.key === 'CR-09').heavy, true);
    assert.equal(board.items.find(i => i.key === 'CR-10').heavy, undefined, 'only the bracket prefix counts');
    await h.call('release_slot', { slot: 's2' });
    const s = await h.call('start_work', { backlogItemKey: 'CR-09', slot: 's2' });
    assert.equal(s.heavy, true);
    const brief = JSON.parse(readFileSync(s.briefFile, 'utf8'));
    assert.equal(brief.heavy, true); assert.equal(brief.deadlineAt, null);
    const left = (Date.parse(brief.stopBy) - Date.now()) / 60000;
    assert.ok(left > 14 && left < 15.5, `stopBy in ${left} min`); assert.equal(brief.stopBy, brief.matchEndsAt);
  } finally { h.close(); }
});

test('heavy items get their final call about 1.5 minutes before the end, not at 3 minutes', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    const pending = async () => {
      for (let i = 0; i < 4; i++) {
        gm.state.sequence++;
        await new Promise(r => setTimeout(r, 1100));
        const w = await h.call('wait_for_update', {});
        if (w.reason === 'DEADLINE_SOON') return w.deadlineSoon;
      }
      return [];
    };
    gm.state.clock = { elapsedSec: 2250, remainingSec: 150 };
    const at25 = await pending();
    assert.ok(at25.length > 0 && !at25.some(d => d.backlogItemKey === 'CR-09'), JSON.stringify(at25));
    gm.state.clock = { elapsedSec: 2320, remainingSec: 80 };
    const at13 = await pending();
    const heavy = at13.find(d => d.backlogItemKey === 'CR-09');
    assert.ok(heavy, JSON.stringify(at13));
    assert.deepEqual([heavy.kind, heavy.heavy, heavy.action], ['MATCH_END', true, 'INTEGRATE_LAST_COMMIT_NOW']);
  } finally { h.close(); }
});

test('wait_for_update noWait returns at once with TIMEOUT, or with the pending event', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    gm.state.clock = { elapsedSec: 1000, remainingSec: 1400 };
    await h.call('refresh_match');
    const t0 = Date.now();
    const quiet = await h.call('wait_for_update', { noWait: true });
    assert.equal(quiet.reason, 'TIMEOUT'); assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
    gm.reveal({ key: 'TASK-09', backlogType: 'TASK', title: 'Count', deadlineMinutes: 8, revealedElapsedSec: 1000, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    await new Promise(r => setTimeout(r, 1100));
    const t1 = Date.now();
    const ev = await h.call('wait_for_update', { noWait: true });
    assert.equal(ev.reason, 'MATCH_UPDATED'); assert.deepEqual(ev.board.newItems, ['TASK-09']);
    assert.ok(Date.now() - t1 < 3000);
  } finally { h.close(); }
});

test('slot s5 is the heavy worker slot; a PI is never placed there', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    const r = await h.call('prepare_slots', { count: 5 });
    assert.equal(r.slots.length, 5);
    await h.call('configure_session', { descriptors: [prepare, start] });
    gm.state.clock = { elapsedSec: 1000, remainingSec: 1400 };
    gm.reveal({ key: 'CR-11', backlogType: 'CR', title: '[Heavy Task] Migrate all reports', deadlineMinutes: null, revealedElapsedSec: 1000, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x' });
    await h.call('refresh_match');
    const s = await h.call('start_work', { backlogItemKey: 'CR-11', slot: 's5' });
    assert.equal(s.slot, 's5'); assert.equal(s.heavy, true);
    // Every other slot busy, s5 busy too: a new PI gets no slot rather than s5.
    const board = await h.call('refresh_match');
    assert.ok(board.slots.some(x => x.slot === 's5' && x.role === 'heavy-worker' && x.item === 'CR-11'));
    await h.call('release_slot', { slot: 's5' });
    for (const x of board.slots.filter(x => x.slot !== 's5' && x.state === 'FREE')) await h.call('start_work', { backlogItemKey: 'TASK-09', slot: x.slot }).catch(() => null);
    gm.reveal({ ...PI, key: 'PI-05' });
    await new Promise(r => setTimeout(r, 1100));
    const w = await h.call('wait_for_update', {});
    assert.equal(w.reason, 'NEW_PI');
    assert.notEqual(w.incident.slot, 's5', 'the heavy slot stays free for heavy items');
  } finally { h.close(); }
});
