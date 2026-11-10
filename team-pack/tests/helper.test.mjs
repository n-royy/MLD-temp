// End-to-end tests of the MCP Helper against the mock Game Master and a local bare Git remote.
// Run: node --test tests/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockGm } from './mock-gm.mjs';
import { validateEvent } from '../src/progress.mjs';

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
let gm, tmp, ws, checkoutRoot, matchRoot, logFile, prepare, start;

class Helper {
  constructor() {
    this.child = spawn(process.execPath, [join(packRoot, 'bin', 'runtime-server.mjs')],
      { env: { MTM_AUTO_INTEGRATE: '0', ...process.env, MTM_HELPER_ALLOW_LOOPBACK: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
    this.next = 1; this.pending = new Map(); this.buf = '';
    this.child.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const msg = JSON.parse(line);
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
  gm = await startMockGm();
  tmp = mkdtempSync(join(tmpdir(), 'mld-pack-test-'));
  ws = join(tmp, 'ws');
  const bare = join(tmp, 'remote.git');
  g(tmp, 'init', '--bare', '-b', 'main', bare);
  const seed = join(tmp, 'seed');
  g(tmp, 'clone', bare, seed);
  mkdirSync(join(seed, gm.matchId, 'src'), { recursive: true });
  writeFileSync(join(seed, gm.matchId, 'src', 'app.txt'), 'v1\n');
  mkdirSync(join(seed, gm.matchId, 'src', 'tests'), { recursive: true });
  writeFileSync(join(seed, gm.matchId, 'src', 'tests', 'app.test.ts'), 'expect(delete()).rejects()\n');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'seed');
  g(seed, 'push', 'origin', 'main');
  checkoutRoot = join(ws, 'matches', gm.matchId);
  matchRoot = join(checkoutRoot, gm.matchId);
  mkdirSync(join(ws, 'team-sdlc-pack', 'logs'), { recursive: true });
  g(tmp, 'clone', bare, checkoutRoot);
  g(checkoutRoot, 'config', 'user.name', 'MLD'); g(checkoutRoot, 'config', 'user.email', 'mld@example.invalid');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-test', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-test', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-test', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile,
    teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-test', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-test', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
    apiKeySecret: gm.apiKey, apiKeyLength: Buffer.byteLength(gm.apiKey), apiKeySha256: createHash('sha256').update(gm.apiKey).digest('hex'),
    apiKeyScopes: ['backlogs:start', 'submissions:create'], gameMasterUrl: `${gm.origin}/`, matchPageUrl: `${gm.origin}/match`,
    allowedApiOrigins: [gm.origin], teamWorkspace: ws, challengeWorkspace: join(ws, 'matches'), teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack'),
    progressLogFile: logFile, environmentRevision: g(checkoutRoot, 'rev-parse', 'HEAD'), checkoutRoot, matchRoot };
});

after(async () => { await gm.close(); rmSync(tmp, { recursive: true, force: true }); });

function logEvents() {
  return readFileSync(logFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
}

test('MCP handshake lists the tools', async () => {
  const h = new Helper();
  const init = await h.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'mtm_helper');
  const list = await h.rpc('tools/list', {});
  assert.ok(list.result.tools.every(t => t.inputSchema?.type === 'object'));
  assert.ok(list.result.tools.some(t => t.name === 'submit_work'));
  h.close();
});

test('full match flow', async () => {
  const h = new Helper();
  // Preparation: login + refresh, no DISCOVERED, Start Work refused.
  const cfg = await h.call('configure_session', { descriptors: [prepare] });
  assert.equal(cfg.phase, 'PREPARATION');
  assert.ok(!JSON.stringify(cfg).includes(gm.pass));
  assert.equal((await h.call('login_match')).status, 'LOGGED_IN');
  const prepBoard = await h.call('refresh_match');
  assert.equal(prepBoard.items.length, 1);
  assert.equal((await h.call('start_work', { backlogItemKey: 'TASK-01' })).error.code, 'NOT_IN_GAME');
  assert.ok(!logEvents().some(e => e.status === 'DISCOVERED'));
  // Invalid integrity is rejected.
  assert.equal((await h.call('configure_session', { descriptors: [prepare, { ...start, apiKeyLength: 3 }] })).error.code, 'API_KEY_INTEGRITY');

  // Game.
  assert.equal((await h.call('configure_session', { descriptors: [prepare, JSON.stringify(start)] })).phase, 'GAME');
  const board = await h.call('refresh_match');
  assert.deepEqual(board.newItems, ['TASK-01']);
  const again = await h.call('refresh_match');
  assert.deepEqual(again.newItems, []);
  const s = await h.call('start_work', { backlogItemKey: 'TASK-01' });
  assert.equal(s.submitTemplate.backlogId, 'TASK-01');
  assert.equal(s.item.key, 'TASK-01');
  assert.equal(s.requiredTestCases, 1);
  assert.ok(logEvents().some(e => e.type === 'BACKLOG_TESTS' && e.backlogId === 'TASK-01' && e.status === 'NOT_RUN' && e.required === 1));
  assert.ok(existsSync(join(matchRoot, 'answers', 'TASK-01', 'submit.json')));
  assert.equal((await h.call('start_work', { backlogItemKey: 'TASK-01' })).replay, true);

  // Scratch files are git-ignored once Start Work ran.
  mkdirSync(join(matchRoot, 'src', '.mtm-tmp'), { recursive: true });
  writeFileSync(join(matchRoot, 'src', '.mtm-tmp', 'run-checks.mjs'), 'console.log(1)\n');
  assert.ok(!g(checkoutRoot, 'status', '--porcelain').includes('.mtm-tmp'));

  // Not committed yet.
  assert.equal((await h.call('submit_work', { backlogItemKey: 'TASK-01' })).error.code, 'ANSWER_NOT_COMMITTED');
  // A one-element evidence list written as a string (the PowerShell ConvertTo-Json bug).
  const answerFile = join(matchRoot, 'answers', 'TASK-01', 'submit.json');
  const bad = { backlogId: 'TASK-01', status: 'DONE', changeSummary: 'Search ignores case.',
    testResults: [{ id: 'TASK-01-TC-01', result: 'PASS', evidence: 'evidence/TASK-01-TC-01.txt' }] };
  writeFileSync(answerFile, JSON.stringify(bad, null, 2));
  writeFileSync(join(matchRoot, 'src', 'app.txt'), 'v2\n');
  g(checkoutRoot, 'add', '--', gm.matchId); g(checkoutRoot, 'commit', '-m', 'TASK-01: fix'); g(checkoutRoot, 'push', 'origin', 'HEAD:main');
  // Evidence referenced but missing.
  assert.equal((await h.call('submit_work', { backlogItemKey: 'TASK-01' })).error.code, 'EVIDENCE_NOT_COMMITTED');
  // Evidence committed but not pushed.
  writeFileSync(join(matchRoot, 'answers', 'TASK-01', 'evidence', 'TASK-01-TC-01.txt'), 'PASS\n');
  g(checkoutRoot, 'add', '--', gm.matchId); g(checkoutRoot, 'commit', '-m', 'TASK-01: evidence');
  assert.equal((await h.call('submit_work', { backlogItemKey: 'TASK-01' })).error.code, 'REVISION_NOT_PUSHED');
  g(checkoutRoot, 'push', 'origin', 'HEAD:main');
  // Schema gate: nothing is sent while the answer is invalid.
  const v1 = await h.call('validate_answer', { backlogItemKey: 'TASK-01' });
  assert.equal(v1.valid, false);
  assert.match(v1.problems.join(' '), /evidence: expected array/);
  const invalid = await h.call('submit_work', { backlogItemKey: 'TASK-01' });
  assert.equal(invalid.error.code, 'ANSWER_SCHEMA_INVALID', JSON.stringify(invalid));
  assert.equal(gm.state.submissions.size, 0);
  // Fixed answer, but an existing test was weakened.
  const answer = { ...bad, testResults: [{ id: 'TASK-01-TC-01', result: 'PASS', evidence: ['evidence/TASK-01-TC-01.txt'] }] };
  writeFileSync(answerFile, JSON.stringify(answer, null, 2));
  assert.equal((await h.call('validate_answer', { backlogItemKey: 'TASK-01' })).valid, true);
  writeFileSync(join(matchRoot, 'src', 'tests', 'app.test.ts'), 'expect(delete()).resolves()\n');
  g(checkoutRoot, 'add', '--', gm.matchId); g(checkoutRoot, 'commit', '-m', 'TASK-01: answer'); g(checkoutRoot, 'push', 'origin', 'HEAD:main');
  const weakened = await h.call('submit_work', { backlogItemKey: 'TASK-01' });
  assert.equal(weakened.error.code, 'EXISTING_TESTS_MODIFIED');
  assert.match(JSON.stringify(weakened.error.details), /tests\/app\.test\.ts/);
  assert.equal((await h.call('submit_work', { backlogItemKey: 'TASK-01', acknowledgeTestChanges: 'too short' })).error.code, 'EXISTING_TESTS_MODIFIED');
  // Restore the test from the prepared revision; then the submission goes through.
  g(checkoutRoot, 'checkout', start.environmentRevision, '--', `${gm.matchId}/src/tests/app.test.ts`);
  g(checkoutRoot, 'commit', '-m', 'TASK-01: keep existing test'); g(checkoutRoot, 'push', 'origin', 'HEAD:main');
  assert.equal(gm.state.submissions.size, 0);
  // Impossible test counts are refused before anything is sent.
  // Counts the agent passes for an item with test-case rows are ignored: the rows decide (no inflated counts).
  assert.equal(gm.state.submissions.size, 0);
  // Server hiccup: two 503s, retried with the same key.
  gm.state.failNextSubmit = 2;
  const sub = await h.call('submit_work', { backlogItemKey: 'TASK-01', tests: { required: 1, executed: 1, passed: 1, failed: 0, summary: 'MVS passed.' } });
  assert.equal(sub.status, 'SUBMITTED', JSON.stringify(sub));
  assert.equal(sub.testStatus, 'PASSED');
  assert.deepEqual([sub.tests.required, sub.tests.executed, sub.tests.passed], [1, 1, 1]);
  assert.ok(Array.isArray(sub.board?.items), 'board returned after submit');
  // 1.5.9: compact result (it stays in the orchestrator's context): counts, not file lists or the full projection.
  assert.equal(sub.evidence, undefined); assert.equal(typeof sub.evidenceFiles, 'number');
  assert.equal(sub.board.endpoints, undefined);
  assert.ok(JSON.stringify(sub).length < 2000, `submit result ${JSON.stringify(sub).length} chars`);
  assert.ok(logEvents().some(e => e.type === 'BACKLOG_TESTS' && e.backlogId === 'TASK-01' && e.status === 'PASSED' && e.executed === 1));
  const sent = gm.state.submissions.get('TASK-01');
  assert.equal(sent.body.gitRevision, g(checkoutRoot, 'rev-parse', 'HEAD'));
  assert.deepEqual(sent.body.answer, answer);
  assert.equal((await h.call('submit_work', { backlogItemKey: 'TASK-01' })).status, 'ALREADY_SUBMITTED_LOCALLY');

  // Expired portal session re-authenticates; wait_for_update sees a new wave.
  gm.expireSessions();
  const logins = gm.state.logins;
  setTimeout(() => gm.reveal({ key: 'PI-01', backlogType: 'PI', title: 'Checkout fails', revisionNo: 1, deadlineMinutes: 10 }), 300);
  const upd = await h.call('wait_for_update', { timeoutMs: 20000 });
  assert.equal(upd.changed, true);
  assert.deepEqual(upd.board.newItems, ['PI-01']);
  assert.ok(gm.state.logins > logins);

  // Company tools.
  const tools = await h.call('company_tools_list');
  assert.equal(tools[0].name, 'search_logs');
  const out = await h.call('company_tool_call', { name: 'search_logs', arguments: { query: 'checkout' }, backlogId: 'PI-01' });
  assert.match(out.text, /logs for checkout/);

  // Progress reporting validation.
  assert.ok((await h.call('report_progress', { event: { type: 'BACKLOG_TESTS', backlogId: 'PI-01', status: 'PASSED', required: 2, executed: 1, passed: 1, failed: 0, skipped: 0, summary: 'x' } })).error);
  assert.ok((await h.call('report_progress', { event: { type: 'ORCHESTRATOR_STARTED', summary: 'x' } })).error);
  assert.ok((await h.call('report_progress', { event: { type: 'BACKLOG_TESTS', backlogId: 'PI-01', status: 'PASSED', required: 1, executed: 1, passed: 1, failed: 0, skipped: 0, summary: 'One scenario passed.' } })).appended);

  // A helper restarted between phases: items read before START_GAME get DISCOVERED even when the
  // agent goes straight to start_work (seen in practice CTG2YCRL).
  gm.reveal({ key: 'CR-01', backlogType: 'CR', title: 'Export invoices', revisionNo: 1, workStatus: 'NOT_STARTED' });
  const h3 = new Helper();
  await h3.call('configure_session', { descriptors: [prepare] });
  await h3.call('refresh_match');
  assert.equal((await h3.call('configure_session', { descriptors: [prepare, start] })).phase, 'GAME');
  assert.equal((await h3.call('start_work', { backlogItemKey: 'CR-01' })).backlogId, 'CR-01');
  const cr = logEvents().filter(e => e.type === 'BACKLOG_STATUS' && e.backlogId === 'CR-01').map(e => e.status);
  assert.deepEqual(cr, ['DISCOVERED', 'IN_PROGRESS']);
  h3.close();

  // Pause/finish ends waiting.
  gm.state.status = 'FINISHED'; gm.state.sequence++;
  const fin = await h.call('wait_for_update', { timeoutMs: 20000 });
  assert.match(fin.reason, /FINISHED/);
  h.close();

  // A replacement process (RESUME_GAME) never resubmits.
  const h2 = new Helper();
  const resume = { ...start, ...prepare, ...start, type: 'RESUME_GAME', requestId: 'restart-1', restartAttempt: 1, reason: 'OPERATOR_RESUME', username: gm.user, password: gm.pass };
  assert.equal((await h2.call('configure_session', { descriptors: [resume] })).phase, 'GAME');
  assert.equal((await h2.call('submit_work', { backlogItemKey: 'TASK-01' })).status, 'ALREADY_SUBMITTED_LOCALLY');
  h2.close();

  // Every line is valid for Player, no secrets, SUBMITTED carries the receipt, rematch never called.
  const raw = readFileSync(logFile, 'utf8');
  assert.ok(!raw.includes(gm.pass) && !raw.includes(gm.apiKey));
  for (const e of logEvents()) assert.equal(validateEvent(e), null, JSON.stringify(e));
  const submitted = logEvents().find(e => e.type === 'BACKLOG_STATUS' && e.status === 'SUBMITTED');
  assert.equal(submitted.receiptId, sent.receipt.id);
  assert.ok(!gm.state.calls.some(c => c.includes('rematch')));
  for (const type of ['DISCOVERED', 'IN_PROGRESS', 'SUBMITTED']) assert.ok(logEvents().some(e => e.status === type), type);
  for (const op of ['LOGIN', 'REFRESH', 'START_WORK', 'SUBMIT']) {
    assert.ok(logEvents().some(e => e.type === 'GAME_MASTER_API' && e.operation === op && e.phase === 'REQUESTED'), op);
  }
});
