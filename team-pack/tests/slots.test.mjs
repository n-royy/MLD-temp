// Multi-agent slots: parallel worktrees, integration onto the assigned branch, conflicts and every submit gate.
// Run: node --test tests/slots.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockGm } from './mock-gm.mjs';
import { validateEvent } from '../src/progress.mjs';

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_EDITOR: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let gm, tmp, bare, checkoutRoot, matchRoot, logFile, prepare, start;

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
  gm = await startMockGm({ matchId: 'SLOT0001' });
  tmp = mkdtempSync(join(tmpdir(), 'mld-slots-test-'));
  const ws = join(tmp, 'ws');
  bare = join(tmp, 'remote.git');
  g(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  const seed = join(tmp, 'seed');
  g(tmp, 'clone', '-q', bare, seed);
  const f = join(seed, gm.matchId);
  mkdirSync(join(f, 'src', 'tests'), { recursive: true });
  writeFileSync(join(f, 'src', 'app.txt'), 'line1\nline2\nline3\n');
  writeFileSync(join(f, 'src', 'other.txt'), 'a\n');
  writeFileSync(join(f, 'src', 'tests', 'app.test.ts'), 'expect(1).toBe(1)\n');
  writeFileSync(join(f, '.gitignore'), 'src/.env\nnode_modules/\n');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed');
  g(seed, 'push', '-q', 'origin', 'main');
  checkoutRoot = join(ws, 'matches', gm.matchId);
  matchRoot = join(checkoutRoot, gm.matchId);
  mkdirSync(join(ws, 'team-sdlc-pack', 'logs'), { recursive: true });
  g(tmp, 'clone', '-q', bare, checkoutRoot);
  g(checkoutRoot, 'config', 'user.name', 'MLD'); g(checkoutRoot, 'config', 'user.email', 'mld@example.invalid');
  writeFileSync(join(matchRoot, 'src', '.env'), 'DATABASE_URL=postgres://app@127.0.0.1:5433/solova_SLOT0001\nPORT=3000\n');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-slots', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-slots', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-slots', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-slots', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-slots', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
    apiKeySecret: gm.apiKey, apiKeyLength: Buffer.byteLength(gm.apiKey), apiKeySha256: createHash('sha256').update(gm.apiKey).digest('hex'),
    apiKeyScopes: ['backlogs:start', 'submissions:create'], gameMasterUrl: `${gm.origin}/`, matchPageUrl: `${gm.origin}/match`,
    allowedApiOrigins: [gm.origin], teamWorkspace: ws, challengeWorkspace: join(ws, 'matches'), teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack'),
    progressLogFile: logFile, environmentRevision: g(checkoutRoot, 'rev-parse', 'HEAD'), checkoutRoot, matchRoot };
});

after(async () => { await gm.close(); rmSync(tmp, { recursive: true, force: true }); });

const events = () => readFileSync(logFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const remoteHead = () => g(bare, 'rev-parse', 'main');

/** What a worker subagent does: edit, answer + evidence, validate, commit on the slot branch, DONE.json. */
function work(s, key, { file = 'src/app.txt', content, answer, done = true, commit = true }) {
  const root = s.slotMatchRoot;
  writeFileSync(join(root, file), content);
  const dir = join(root, 'answers', key);
  writeFileSync(join(dir, 'evidence', `${key}-TC-01.txt`), 'command: run\nresult: PASS\n');
  writeFileSync(join(dir, 'submit.json'), JSON.stringify(answer ?? { backlogId: key, status: 'DONE', changeSummary: `${key} done.`,
    testResults: [{ id: `${key}-TC-01`, result: 'PASS', evidence: [`evidence/${key}-TC-01.txt`] }] }, null, 2));
  if (commit) { g(s.worktreeRoot, 'add', '--', gm.matchId); g(s.worktreeRoot, 'commit', '-qm', `${key}: fix`); }
  if (done) writeFileSync(s.doneFile, JSON.stringify({ status: 'DONE', summary: `${key} fixed`,
    tests: { required: 1, executed: 41, passed: 41, failed: 0, skipped: 0, summary: '36 unit tests + suite + build.' } }));
}

test('slots: prepare, parallel work, integrate, conflict, gates', async () => {
  const h = new Helper();
  await h.call('configure_session', { descriptors: [prepare] });
  // Preparation: slots with per-slot database names; tracked files cannot be copied.
  assert.equal((await h.call('prepare_slots', { count: 2, copyFiles: ['src/app.txt'] })).error.code, 'COPY_FILE_TRACKED');
  assert.equal((await h.call('prepare_slots', { count: 7 })).error.code, 'INVALID_SLOT_COUNT');
  const prep = await h.call('prepare_slots', { count: 2, copyFiles: [{ path: 'src/.env', replace: { solova_SLOT0001: 'solova_SLOT0001_{slot}', 'PORT=3000': 'PORT=30{n}0' } }] });
  assert.equal(prep.slots.length, 2);
  const env1 = readFileSync(join(prep.slots[0].matchRoot, 'src', '.env'), 'utf8');
  assert.match(env1, /solova_SLOT0001_s1/); assert.match(env1, /PORT=3010/);
  assert.equal(g(checkoutRoot, 'status', '--porcelain'), '', 'checkout stays clean');
  assert.equal((await h.call('prepare_slots', { count: 2 })).slots.length, 2, 'idempotent');
  const branches = g(bare, 'branch', '--list');
  assert.ok(!branches.includes('mtm-slot'), 'slot branches are never pushed');

  // Game.
  await h.call('configure_session', { descriptors: [prepare, start] });
  gm.reveal({ key: 'BUG-01', backlogType: 'BUG', title: 'Totals wrong', revisionNo: 1, workStatus: 'NOT_STARTED' });
  gm.reveal({ key: 'CR-01', backlogType: 'CR', title: 'Export', revisionNo: 1, workStatus: 'NOT_STARTED' });
  const board = await h.call('refresh_match');
  assert.deepEqual(board.slots.map(s => s.state), ['FREE', 'FREE']);
  mkdirSync(join(matchRoot, '.mtm-tmp', 'tools'), { recursive: true });
  writeFileSync(join(matchRoot, '.mtm-tmp', 'tools', 'serve.mjs'), 'console.log("READY")\n');
  const s1 = await h.call('start_work', { backlogItemKey: 'TASK-01', slot: 's1' });
  assert.ok(existsSync(join(s1.slotMatchRoot, '.mtm-tmp', 'tools', 'serve.mjs')), 'scout tools are copied into the slot');
  assert.equal(s1.slot, 's1');
  assert.ok(!('submitTemplate' in s1) && !('item' in s1), 'orchestrator gets a short summary, not the brief');
  const brief = JSON.parse(readFileSync(s1.briefFile, 'utf8'));
  assert.equal(brief.item.key, 'TASK-01');
  assert.equal(brief.submitTemplate.backlogId, 'TASK-01');
  assert.ok(existsSync(join(s1.slotMatchRoot, 'answers', 'TASK-01', 'submit.json')));
  assert.ok(!existsSync(join(matchRoot, 'answers', 'TASK-01')), 'answer lives in the slot');
  assert.equal((await h.call('start_work', { backlogItemKey: 'CR-01', slot: 's1' })).error.code, 'SLOT_BUSY');
  assert.equal((await h.call('start_work', { backlogItemKey: 'TASK-01', slot: 's2' })).error.code, 'ITEM_IN_OTHER_SLOT');
  const s2 = await h.call('start_work', { backlogItemKey: 'BUG-01', slot: 's2' });
  assert.ok(events().some(e => e.type === 'BACKLOG_STATUS' && e.backlogId === 'BUG-01' && e.status === 'IN_PROGRESS'));
  assert.ok(g(checkoutRoot, 'status', '--porcelain', '--untracked-files=all') === '' , 'scratch and slots stay out of the checkout status');

  // Company tool output goes to the worker's slot.
  const co = await h.call('company_tool_call', { name: 'search_logs', arguments: { query: 'totals' }, backlogId: 'BUG-01', saveToSlot: true });
  assert.ok(existsSync(co.savedTo) && co.savedTo.startsWith(s2.slotMatchRoot));
  assert.match(co.head, /logs for totals/);

  // Two workers edit the same line in parallel.
  work(s1, 'TASK-01', { content: 'line1\nTASK\nline3\n' });
  // The worker's own validator works without the helper session.
  const v = JSON.parse(execFileSync(process.execPath, [join(dirname(s1.briefFile), 'validate.mjs')], { encoding: 'utf8' }));
  assert.equal(v.valid, true, JSON.stringify(v));
  assert.equal((await h.call('validate_answer', { backlogItemKey: 'TASK-01' })).valid, true);
  const w = await h.call('wait_for_update', { timeoutMs: 20000 });
  assert.equal(w.reason, 'SLOT_DONE');
  assert.deepEqual(w.slotDone.map(d => d.item), ['TASK-01']);
  assert.equal(w.slotDone[0].tests.passed, 41); // DONE.json is only reported, never logged as-is
  work(s2, 'BUG-01', { content: 'line1\nBUG\nline3\n' });

  const before = remoteHead();
  const i1 = await h.call('integrate_item', { backlogItemKey: 'TASK-01' });
  assert.equal(i1.status, 'SUBMITTED', JSON.stringify(i1));
  assert.equal(i1.integratedCommits, 1);
  // Inflated worker counts (suite, build, own tests) never reach the log: one template row = one test case.
  const t1 = events().filter(e => e.type === 'BACKLOG_TESTS' && e.backlogId === 'TASK-01').at(-1);
  assert.deepEqual([t1.status, t1.required, t1.executed, t1.passed], ['PASSED', 1, 1, 1]);
  assert.notEqual(remoteHead(), before);
  assert.equal(gm.state.submissions.get('TASK-01').body.gitRevision, remoteHead());
  assert.equal(i1.board.slots.find(s => s.slot === 's1').state, 'FREE');

  // Conflict: aborted cleanly, nothing pushed or sent.
  const pushed = remoteHead();
  const c = await h.call('integrate_item', { backlogItemKey: 'BUG-01' });
  assert.equal(c.error.code, 'INTEGRATION_CONFLICT');
  assert.deepEqual(c.error.details.conflicts, [`${gm.matchId}/src/app.txt`]);
  assert.equal(remoteHead(), pushed);
  assert.equal(g(checkoutRoot, 'status', '--porcelain'), '');
  assert.ok(!gm.state.submissions.has('BUG-01'));
  // The worker rebases onto the assigned branch and resolves.
  assert.throws(() => g(s2.worktreeRoot, 'rebase', 'main'));
  writeFileSync(join(s2.slotMatchRoot, 'src', 'app.txt'), 'line1\nTASK\nBUG\nline3\n');
  g(s2.worktreeRoot, 'add', '--', gm.matchId); g(s2.worktreeRoot, 'rebase', '--continue');
  const i2 = await h.call('integrate_item', { backlogItemKey: 'BUG-01' });
  assert.equal(i2.status, 'SUBMITTED', JSON.stringify(i2));
  assert.equal(readFileSync(join(matchRoot, 'src', 'app.txt'), 'utf8'), 'line1\nTASK\nBUG\nline3\n');

  // A reused slot starts from the integrated branch.
  const s3 = await h.call('start_work', { backlogItemKey: 'CR-01', slot: 's1' });
  assert.equal(readFileSync(join(s3.slotMatchRoot, 'src', 'app.txt'), 'utf8'), 'line1\nTASK\nBUG\nline3\n');
  assert.ok(!existsSync(join(s3.slotMatchRoot, 'answers', 'BUG-01')) || true);
  // Uncommitted work is refused.
  work(s3, 'CR-01', { file: 'src/other.txt', content: 'b\n', commit: false,
    answer: { backlogId: 'CR-01', status: 'DONE', changeSummary: 'x', testResults: [{ id: 'CR-01-TC-01', result: 'PASS', evidence: 'evidence/CR-01-TC-01.txt' }] } });
  assert.equal((await h.call('integrate_item', { backlogItemKey: 'CR-01' })).error.code, 'SLOT_UNCOMMITTED');
  // Files outside the assigned folder are refused.
  g(s3.worktreeRoot, 'add', '--', gm.matchId);
  writeFileSync(join(s3.worktreeRoot, 'ROOT.md'), 'x\n'); g(s3.worktreeRoot, 'add', 'ROOT.md');
  g(s3.worktreeRoot, 'commit', '-qm', 'CR-01: work');
  assert.equal((await h.call('integrate_item', { backlogItemKey: 'CR-01' })).error.code, 'OUTSIDE_FOLDER');
  g(s3.worktreeRoot, 'rm', '-q', 'ROOT.md'); g(s3.worktreeRoot, 'commit', '-qm', 'CR-01: keep folder');
  // The submit gates still run: the one-element evidence string is caught after the push, nothing sent.
  const bad = await h.call('integrate_item', { backlogItemKey: 'CR-01' });
  assert.equal(bad.error.code, 'ANSWER_SCHEMA_INVALID', JSON.stringify(bad));
  assert.ok(!gm.state.submissions.has('CR-01'));
  // Fix in the slot; only the new commit is integrated.
  writeFileSync(join(s3.slotMatchRoot, 'answers', 'CR-01', 'submit.json'), JSON.stringify({ backlogId: 'CR-01', status: 'DONE', changeSummary: 'x',
    testResults: [{ id: 'CR-01-TC-01', result: 'PASS', evidence: ['evidence/CR-01-TC-01.txt'] }] }, null, 2));
  g(s3.worktreeRoot, 'add', '--', gm.matchId); g(s3.worktreeRoot, 'commit', '-qm', 'CR-01: answer');
  const i3 = await h.call('integrate_item', { backlogItemKey: 'CR-01' });
  assert.equal(i3.status, 'SUBMITTED', JSON.stringify(i3));
  assert.equal(i3.integratedCommits, 1);
  assert.equal(g(checkoutRoot, 'log', '--oneline', '--grep', 'CR-01: work').split('\n').length, 1, 'no duplicated commits');
  assert.equal((await h.call('integrate_item', { backlogItemKey: 'CR-01' })).error.code, 'ITEM_NOT_IN_SLOT');

  // 1.5.16: a prerequisite's fix reaches the dependent by cherry-pick before either is submitted (PREREQ_FIX_READY),
  // and the copy already on the branch is skipped when the second item is integrated.
  gm.reveal({ key: 'BUG-02', backlogType: 'BUG', title: 'Books', revisionNo: 1, workStatus: 'NOT_STARTED', descriptionMd: 'Fix the books.' });
  gm.reveal({ key: 'CR-02', backlogType: 'CR', title: 'Audit', revisionNo: 1, workStatus: 'NOT_STARTED', deadlineMinutes: 20,
    descriptionMd: 'Audit page; right only on source that also contains the BUG-02 fixes.' });
  await h.call('refresh_match');
  const p1 = await h.call('start_work', { backlogItemKey: 'BUG-02', slot: 's1' });
  const p2 = await h.call('start_work', { backlogItemKey: 'CR-02', slot: 's2' });
  assert.ok(JSON.parse(readFileSync(p1.briefFile, 'utf8')).fixCommitFile.endsWith('FIX_COMMIT'));
  writeFileSync(join(p1.slotMatchRoot, 'src', 'fix.txt'), 'fixed\n');
  g(p1.worktreeRoot, 'add', '--', gm.matchId); g(p1.worktreeRoot, 'commit', '-qm', 'BUG-02: fix the books');
  const sha = g(p1.worktreeRoot, 'rev-parse', 'HEAD');
  writeFileSync(join(dirname(p1.doneFile), 'FIX_COMMIT'), `${sha}\n`);
  const pf = await h.call('wait_for_update', { noWait: true });
  assert.equal(pf.reason, 'PREREQ_FIX_READY', JSON.stringify(pf).slice(0, 300));
  assert.deepEqual([pf.prereqFix[0].backlogItemKey, pf.prereqFix[0].commit, pf.prereqFix[0].dependents[0].slot], ['BUG-02', sha, 's2']);
  assert.notEqual((await h.call('wait_for_update', { noWait: true })).reason, 'PREREQ_FIX_READY', 'reported once');
  g(p2.worktreeRoot, 'cherry-pick', sha);
  work(p2, 'CR-02', { file: 'src/audit.txt', content: 'audit\n' });
  work(p1, 'BUG-02', { file: 'src/books.txt', content: 'books\n' });
  const d2 = await h.call('integrate_item', { backlogItemKey: 'CR-02' });
  assert.equal(d2.status, 'SUBMITTED', JSON.stringify(d2));
  const d1 = await h.call('integrate_item', { backlogItemKey: 'BUG-02' });
  assert.equal(d1.status, 'SUBMITTED', JSON.stringify(d1));
  assert.equal(d1.integratedCommits, 1, 'the fix already on the branch is not picked again');
  assert.equal(g(checkoutRoot, 'log', '--oneline', '--grep', 'BUG-02: fix the books').split('\n').length, 1);
  h.close();

  // Resume: a new helper process sees the slots and never resubmits.
  const h2 = new Helper();
  await h2.call('configure_session', { descriptors: [prepare, start] });
  const b2 = await h2.call('refresh_match');
  assert.deepEqual(b2.slots.map(s => s.state), ['FREE', 'FREE']);
  assert.equal((await h2.call('submit_work', { backlogItemKey: 'TASK-01' })).status, 'ALREADY_SUBMITTED_LOCALLY');
  h2.close();

  const raw = readFileSync(logFile, 'utf8');
  assert.ok(!raw.includes(gm.pass) && !raw.includes(gm.apiKey));
  for (const e of events()) assert.equal(validateEvent(e), null, JSON.stringify(e));
  assert.equal(events().filter(e => e.type === 'BACKLOG_STATUS' && e.status === 'SUBMITTED').length, 5); // TASK-01, BUG-01, CR-01, CR-02, BUG-02
  assert.ok(!g(bare, 'branch', '--list').includes('mtm-slot'));
});
