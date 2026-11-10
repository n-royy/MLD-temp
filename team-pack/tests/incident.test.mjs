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
      { env: { MTM_AUTO_INTEGRATE: '0', ...process.env, MTM_HELPER_ALLOW_LOOPBACK: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
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
    // 1.5.10: while the PI is open, a finished item without a deadline waits (the PI scores by submission order).
    assert.equal(w.board.slots.find(x => x.slot === 's1').state, 'DONE_HELD_FOR_PI');
    assert.deepEqual(w.board.heldForPi, ['BUG-07']);
    const held = await h.call('wait_for_update', { noWait: true });
    assert.notEqual(held.reason, 'SLOT_DONE', JSON.stringify(held).slice(0, 300));
    // Once the PI is submitted the worker's result comes, and the PI is never reported twice.
    gm.state.backlog.find(i => i.key === 'PI-01').submission = { attemptNo: 1, receivedAt: new Date().toISOString() };
    await h.call('refresh_match');
    const w2 = await h.call('wait_for_update', {});
    assert.equal(w2.reason, 'SLOT_DONE', JSON.stringify(w2).slice(0, 300));
    assert.equal(w2.board.heldForPi, undefined);
    // Manual trigger returns the same prepared data without collecting again.
    const before = gm.state.companyCalls;
    const again = await h.call('prepare_incident', { backlogItemKey: 'PI-01' });
    assert.equal(again.slot, 's4'); assert.equal(gm.state.companyCalls, before);
    const fresh = await h.call('prepare_incident', { backlogItemKey: 'PI-01', refresh: true });
    assert.equal(fresh.slot, 's4'); assert.ok(gm.state.companyCalls > before, 'refresh collects again');
    // 1.5.9: a large Company Tools answer goes to a file in the item's slot; a small one comes back inline.
    const big = await h.call('company_tool_call', { name: 'export_logs', arguments: {}, backlogId: 'PI-01' });
    assert.ok(big.savedTo && big.savedTo.startsWith(inc.slotMatchRoot), JSON.stringify(big).slice(0, 300));
    assert.ok(big.chars > 6000 && big.head.length <= 301 && JSON.stringify(big).length < 1200);
    assert.ok(readFileSync(big.savedTo, 'utf8').includes('INV-MLD-1106'));
    const small = await h.call('company_tool_call', { name: 'kb_search', arguments: { query: 'KB-AR-05' }, backlogId: 'PI-01' });
    assert.ok(typeof small.text === 'string' && !small.savedTo);
    // 1.5.9: a timestamped timeline for the post-match review.
    const tl = readFileSync(join(dirname(matchRoot), '.git', 'mtm', 'timeline.ndjson'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    for (const ev of ['DISCOVERED', 'START_WORK', 'INCIDENT_READY', 'SLOT_DONE_SEEN']) assert.ok(tl.some(e => e.event === ev && e.at), ev);
    assert.ok(tl.find(e => e.event === 'SLOT_DONE_SEEN' && e.key === 'BUG-07').doneAt);
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

// A brief shaped like the heavy items of 32PTEO8K (no title prefix any more: the helper reads the brief).
const HEAVY_DESC = '# Settlement archive audit\n## Context\nThe archive holds intraday and end-of-day records; some were reversed, ' +
  'some rule documents are superseded.\n## Requirements\n1. The archive is `data/settlement-archive.json.gz`: 50,000 records.\n' +
  '2. Decompress it outside src/.\n3. Report:\n   - **activeCodes**: codes.\n   - **validCount**: after deduplication.\n' +
  '   - **voidCount**: reversed.\n   - **netMinor**: sum.\n   - **byAccount**: one object per account, sorted by accountId.\n## Grading\nEach field is compared exactly.';

test('heavy items: recognised from the brief (no title prefix); the brief carries heavy, effort and stopBy', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    gm.state.clock = { elapsedSec: 1500, remainingSec: 900 };
    gm.reveal({ key: 'CR-09', backlogType: 'CR', title: 'Settlement archive audit', deadlineMinutes: null, revealedElapsedSec: 1500, revisionNo: 1, workStatus: 'NOT_STARTED', description: HEAVY_DESC });
    gm.reveal({ key: 'CR-10', backlogType: 'CR', title: '[Heavy Task] Rain icon on the dashboard', deadlineMinutes: null, revealedElapsedSec: 1500, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'Show a rain icon.' });
    const board = await h.call('refresh_match');
    assert.equal(board.items.find(i => i.key === 'CR-09').heavy, true);
    assert.equal(board.items.find(i => i.key === 'CR-10').heavy, undefined, 'a title prefix alone no longer counts');
    const compact = (await h.call('wait_for_update', { noWait: true })).board.items.find(i => i.key === 'CR-09');
    assert.equal(compact.effort, 'XL'); assert.ok(compact.effortReasons.some(r => /compressed data/.test(r)), JSON.stringify(compact));
    await h.call('release_slot', { slot: 's2' });
    const s = await h.call('start_work', { backlogItemKey: 'CR-09', slot: 's2' });
    assert.equal(s.heavy, true);
    const brief = JSON.parse(readFileSync(s.briefFile, 'utf8'));
    assert.equal(brief.heavy, true); assert.equal(brief.deadlineAt, null); assert.equal(brief.effort.level, 'XL');
    assert.match(brief.grading, /compared exactly/);
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
    gm.reveal({ key: 'CR-11', backlogType: 'CR', title: 'Migrate all reports', deadlineMinutes: null, revealedElapsedSec: 1000, revisionNo: 1, workStatus: 'NOT_STARTED', description: HEAVY_DESC });
    await h.call('refresh_match');
    const s = await h.call('start_work', { backlogItemKey: 'CR-11', slot: 's5', force: true }); // earlier tests left deadline items
    assert.equal(s.slot, 's5'); assert.equal(s.heavy, true);
    // Every other slot busy, s5 busy too: a new PI gets no slot rather than s5.
    const board = await h.call('refresh_match');
    assert.ok(board.slots.some(x => x.slot === 's5' && x.role === 'heavy-worker' && x.item === 'CR-11'));
    await h.call('release_slot', { slot: 's5' });
    for (const x of board.slots.filter(x => x.slot !== 's5' && x.state === 'FREE')) await h.call('start_work', { backlogItemKey: 'TASK-09', slot: x.slot }).catch(() => null);
    gm.reveal({ ...PI, key: 'PI-05' });
    await new Promise(r => setTimeout(r, 1100));
    let w = await h.call('wait_for_update', {});
    // Deadline items left by earlier tests can take a free slot: the wave comes first, NEW_PI on the next call.
    if (w.reason === 'MATCH_UPDATED') w = await h.call('wait_for_update', {});
    assert.equal(w.reason, 'NEW_PI');
    assert.notEqual(w.incident.slot, 's5', 'the heavy slot stays free for heavy items');
  } finally { h.close(); }
});

test('answer_item: a value answer filled, validated, committed and submitted in one call', async () => {
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    await h.call('release_slot', { slot: 's1' });
    gm.reveal({ ...PI, key: 'PI-07' });
    const inc = await h.call('prepare_incident', { backlogItemKey: 'PI-07' });
    assert.equal(inc.started, true, JSON.stringify(inc).slice(0, 300));
    assert.ok(existsSync(join(inc.dir, 'solve-starter.mjs')));
    const bad = await h.call('answer_item', { backlogItemKey: 'PI-07', values: { rootCause: 'x' } });
    assert.match(bad.error?.code ?? '', /UNKNOWN_FIELD/);
    const invalid = await h.call('answer_item', { backlogItemKey: 'PI-07', values: { rootCauseRelease: '' } });
    assert.equal(invalid.status, 'INVALID');
    const out = join(inc.slotMatchRoot, '.mtm-tmp', 'PI-07', 'investigation.json');
    writeFileSync(out, JSON.stringify({ result: { rootCauseRelease: 'rel-1' } }));
    const r = await h.call('answer_item', { backlogItemKey: 'PI-07', values: { rootCauseRelease: 'rel-1', affectedInvoices: ['A-1', 'A-2'] },
      record: { impact: 'two invoices' }, evidence: { 'investigation.json': { from: out } }, integrate: true });
    assert.equal(r.status, 'ANSWERED', JSON.stringify(r).slice(0, 400));
    assert.equal(r.integration.status, 'SUBMITTED', JSON.stringify(r.integration).slice(0, 400));
    const answer = JSON.parse(readFileSync(r.answerFile, 'utf8'));
    assert.deepEqual([answer.status, answer.rootCauseRelease, answer.evidenceFiles, answer.incidentRecord.impact, answer.incidentRecord.rootCause],
      ['DONE', 'rel-1', ['evidence/investigation.json'], 'two invoices', '']);
    const outside = await h.call('answer_item', { backlogItemKey: 'PI-07', evidence: { 'x.json': { from: '/etc/hostname' } } });
    assert.ok(outside.error, 'evidence must come from inside the slot');
  } finally { h.close(); }
});

test('1.5.21: no dependency scheduling; the brief carries every other item in backlogFile; an open PI holds items without a deadline', async () => {
  const item = (key, type, deadlineMinutes, descriptionMd) => ({ key, backlogType: type, title: key, deadlineMinutes, revealedElapsedSec: 600,
    revisionNo: 1, workStatus: 'NOT_STARTED', descriptionMd });
  gm.state.backlog = [
    item('CR-17', 'CR', 20, 'The official test data is right only on source that also contains the BUG-21 fixes.'),
    item('BUG-21', 'BUG', null, 'A customer\'s books do not match: reconciliation drops reversed entries.'),
    item('TASK-25', 'TASK', null, 'Budget month range.')
  ];
  gm.state.clock = { elapsedSec: 700, remainingSec: 1700 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    await h.call('prepare_slots', { count: 4 });
    await h.call('configure_session', { descriptors: [prepare, start] });
    for (const slot of ['s1', 's2', 's3', 's4', 's5']) await h.call('release_slot', { slot }).catch(() => null);
    const board = (await h.call('wait_for_update', { noWait: true })).board;
    const by = Object.fromEntries(board.items.map(i => [i.key, i]));
    assert.equal(by['CR-17'].dependsOn, undefined); assert.equal(by['BUG-21'].prerequisiteOf, undefined);
    assert.equal(by['BUG-21'].effectiveMinutesLeft, undefined); assert.equal(by['BUG-21'].minutesLeft, undefined);
    // 1.5.22: a no-deadline item never takes a slot while a deadline item waits for one.
    const refused = await h.call('start_work', { backlogItemKey: 'BUG-21', slot: 's1' });
    assert.equal(refused.error?.code, 'DEADLINE_ITEM_WAITING', JSON.stringify(refused));
    assert.deepEqual(refused.error.details?.waiting?.map(w => w.key) ?? refused.error.waiting?.map(w => w.key), ['CR-17']);
    assert.deepEqual((await h.call('wait_for_update', { noWait: true })).board.deadlineWaiting.map(w => w.key), ['CR-17']);
    // 1.5.23 deadline order: least slack first (minutes left minus what its effort needs), then the earlier wave.
    gm.reveal({ key: 'TASK-31', backlogType: 'TASK', title: 'Late short', deadlineMinutes: 10, revealedElapsedSec: 690, revisionNo: 1, workStatus: 'NOT_STARTED', descriptionMd: 'x' });
    gm.reveal({ key: 'TASK-30', backlogType: 'TASK', title: 'Same wave longer', deadlineMinutes: 30, revealedElapsedSec: 600, revisionNo: 1, workStatus: 'NOT_STARTED', descriptionMd: 'x' });
    await h.call('refresh_match');
    const dw = (await h.call('wait_for_update', { noWait: true })).board.deadlineWaiting;
    assert.deepEqual(dw.map(w => w.key), ['TASK-31', 'CR-17', 'TASK-30'], JSON.stringify(dw));
    gm.state.backlog = gm.state.backlog.filter(i => !['TASK-30', 'TASK-31'].includes(i.key));
    await h.call('refresh_match');
    const cr = await h.call('start_work', { backlogItemKey: 'CR-17', slot: 's3' });
    const bug = await h.call('start_work', { backlogItemKey: 'BUG-21', slot: 's1' });
    const task = await h.call('start_work', { backlogItemKey: 'TASK-25', slot: 's2' });
    const crBrief = JSON.parse(readFileSync(cr.briefFile, 'utf8'));
    assert.equal(crBrief.dependsOn, undefined);
    assert.deepEqual(crBrief.otherItems.map(d => [d.key, d.state]), [['BUG-21', 'NOT_STARTED'], ['TASK-25', 'NOT_STARTED']]);
    assert.match(readFileSync(crBrief.backlogFile, 'utf8'), /## BUG-21[\s\S]*reversed entries/);
    const bugBrief = JSON.parse(readFileSync(bug.briefFile, 'utf8'));
    assert.equal(bugBrief.stopBy && bugBrief.deadlineAt, null, 'a no-deadline item has no deadline of anyone else');
    // Everything finishes while a PI is open: only the deadline item goes before the PI.
    for (const s of [bug, task, cr]) writeFileSync(s.doneFile, JSON.stringify({ status: 'DONE', summary: 'done' }));
    const { submission, ...pi } = PI;
    gm.reveal({ ...pi, key: 'PI-09' });
    await new Promise(r => setTimeout(r, 1100));
    const w = await h.call('wait_for_update', {});
    assert.equal(w.reason, 'NEW_PI', JSON.stringify(w).slice(0, 300));
    const w2 = await h.call('wait_for_update', {});
    assert.equal(w2.reason, 'SLOT_DONE');
    assert.deepEqual(w2.slotDone.map(d => d.item), ['CR-17']);
    assert.deepEqual([...w2.board.heldForPi].sort(), ['BUG-21', 'TASK-25']);
    gm.state.backlog.find(i => i.key === 'PI-09').submission = { attemptNo: 1 };
    await h.call('refresh_match');
    const w3 = await h.call('wait_for_update', {});
    assert.equal(w3.reason, 'SLOT_DONE'); assert.deepEqual(w3.slotDone.map(d => d.item).sort(), ['BUG-21', 'TASK-25']);
  } finally { h.close(); }
});

test('1.5.11: grading kinds from the brief give a quality gate; a DONE.json without it is flagged MISSING', async () => {
  const item = (key, type, descriptionMd) => ({ key, backlogType: type, title: key, deadlineMinutes: null, revealedElapsedSec: 600,
    revisionNo: 1, workStatus: 'NOT_STARTED', descriptionMd });
  gm.state.backlog = [
    item('TASK-38', 'TASK', '# Suite\n## Requirements\nImplement the cases.\n## Grading\nYour suite is run against builds that each break one part of the specification: it earns a detection share for each broken build it fails on.'),
    item('TASK-37', 'TASK', '# Statement pack\n## Requirements\nCommit the files and manifest.json.\n## Acceptance criteria\n3. The pack meets every volume, mix and overlap requirement.\n## Grading\nEach acceptance part is checked on its own.'),
    item('CR-37', 'CR', '# Audit page\n## Grading\nTC-01 is replayed. Hidden tests check the server audit and load the official test data with your submitted source.'),
    item('BUG-37', 'BUG', '# Layout\n## Grading\nTC-01 and TC-02 are replayed with the MVS test.')
  ];
  gm.state.clock = { elapsedSec: 700, remainingSec: 1700 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    await h.call('prepare_slots', { count: 4 });
    await h.call('configure_session', { descriptors: [prepare, start] });
    for (const slot of ['s1', 's2', 's3', 's4', 's5']) await h.call('release_slot', { slot }).catch(() => null);
    await h.call('refresh_match');
    const started = {};
    for (const [key, slot] of [['TASK-38', 's1'], ['TASK-37', 's2'], ['CR-37', 's3'], ['BUG-37', 's5']]) started[key] = await h.call('start_work', { backlogItemKey: key, slot });
    const kinds = Object.fromEntries(Object.entries(started).map(([k, r]) => [k, JSON.parse(readFileSync(r.briefFile, 'utf8')).qualityGate?.kind ?? null]));
    assert.deepEqual(kinds, { 'TASK-38': 'SUITE_DETECTION', 'TASK-37': 'DATA_REQUIREMENTS', 'CR-37': 'OFFICIAL_DATA', 'BUG-37': null });
    const brief = JSON.parse(readFileSync(started['TASK-38'].briefFile, 'utf8'));
    assert.ok(brief.qualityGate.reportFile.endsWith('quality-gate.md') && 'issuedRevision' in brief);
    writeFileSync(started['TASK-38'].doneFile, JSON.stringify({ status: 'DONE', summary: 'suite passes' }));
    writeFileSync(started['TASK-37'].doneFile, JSON.stringify({ status: 'DONE', summary: 'pack', qualityGate: { status: 'PASS', summary: '14/14 requirements with margin' } }));
    writeFileSync(started['BUG-37'].doneFile, JSON.stringify({ status: 'DONE', summary: 'fixed' }));
    const w = await h.call('wait_for_update', {});
    assert.equal(w.reason, 'SLOT_DONE');
    const by = Object.fromEntries(w.slotDone.map(d => [d.item, d]));
    assert.equal(by['TASK-38'].qualityGate.status, 'MISSING'); assert.ok(by['TASK-38'].qualityGate.minutesLeft > 20);
    assert.equal(by['TASK-37'].qualityGate.status, 'PASS');
    assert.equal(by['BUG-37'].qualityGate, undefined);
  } finally { h.close(); }
});

test('1.5.22: deadlineWaiting skips started and unfinishable items; s4 only takes a value TASK; a PI without a slot holds nothing', async () => {
  const item = (key, type, deadlineMinutes, revealedElapsedSec, descriptionMd = 'Short item.') => ({ key, backlogType: type, title: key,
    deadlineMinutes, revealedElapsedSec, revisionNo: 1, workStatus: 'NOT_STARTED', descriptionMd });
  gm.state.backlog = [
    item('TASK-41', 'TASK', 15, 1000, 'Answer the value.'),
    item('TASK-42', 'TASK', 15, 1000, 'Build a statement pack: a manifest with volume, mix and overlap requirements; at most 20 MB.\n## Grading\nEach requirement is checked.'),
    item('CR-43', 'CR', 5, 600),
    item('TASK-44', 'TASK', null, 1000)
  ];
  gm.state.clock = { elapsedSec: 1100, remainingSec: 1300 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    await h.call('prepare_slots', { count: 5 });
    await h.call('configure_session', { descriptors: [prepare, start] });
    for (const slot of ['s1', 's2', 's3', 's4', 's5']) await h.call('release_slot', { slot }).catch(() => null);
    await h.call('refresh_match');
    // CR-43: 5 minutes from minute 10 at minute 18.3 -> closed; never listed. TASK-42 needs a quality gate.
    const w = (await h.call('wait_for_update', { noWait: true })).board.deadlineWaiting.map(d => d.key);
    assert.deepEqual(w, ['TASK-41', 'TASK-42']);
    // s4: TASK-44 (no deadline) is refused for TASK-41 (a value TASK) ...
    assert.equal((await h.call('start_work', { backlogItemKey: 'TASK-44', slot: 's4' })).error?.code, 'DEADLINE_ITEM_WAITING');
    const t41 = await h.call('start_work', { backlogItemKey: 'TASK-41', slot: 's1' });
    // ... but not for TASK-42 (a data pack belongs to a worker), so s4 may take TASK-44.
    assert.ok((await h.call('start_work', { backlogItemKey: 'TASK-44', slot: 's4' })).briefFile);
    // A started deadline item that was released does not come back as "waiting".
    await h.call('release_slot', { slot: 's1' });
    assert.deepEqual((await h.call('wait_for_update', { noWait: true })).board.deadlineWaiting.map(d => d.key), ['TASK-42']);
    assert.ok(t41.briefFile);
  } finally { h.close(); }
});
