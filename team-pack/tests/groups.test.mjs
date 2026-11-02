// 1.4.0: baseline repair before workers branch, and one worker per group (next item chained in the same slot).
// Run: node --test tests/groups.test.mjs
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
    if (process.env.TRACE) console.error('CALL', name);
    const msg = await this.rpc('tools/call', { name, arguments: args });
    const payload = JSON.parse(msg.result.content[0].text);
    return msg.result.isError ? { error: payload.error } : payload;
  }
  close() { this.child.stdin.end(); this.child.kill(); }
}

before(async () => {
  gm = await startMockGm({ matchId: 'GRPS0001' });
  tmp = mkdtempSync(join(tmpdir(), 'mld-groups-test-'));
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
  writeFileSync(join(matchRoot, 'src', '.env'), 'DATABASE_URL=postgres://app@127.0.0.1:5433/solova_GRPS0001\nPORT=3000\n');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-groups', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-groups', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-groups', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-groups', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-groups', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
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


test('groups: baseline first, chained items in one slot, unintegrated work guarded', async () => {
  const h = new Helper();
  await h.call('configure_session', { descriptors: [prepare] });
  await h.call('prepare_slots', { count: 1 });
  await h.call('configure_session', { descriptors: [prepare, start] });
  gm.reveal({ key: 'BUG-01', backlogType: 'BUG', title: 'Layout', revisionNo: 1, workStatus: 'NOT_STARTED' });
  gm.reveal({ key: 'CR-01', backlogType: 'CR', title: 'Export', revisionNo: 1, workStatus: 'NOT_STARTED' });
  await h.call('refresh_match');

  // Baseline patch prepared during preparation (git-ignored), tested in a slot by the scout.
  assert.equal((await h.call('apply_baseline', { backlogItemKey: 'TASK-01' })).error.code, 'NOT_STARTED');
  const s1 = await h.call('start_work', { backlogItemKey: 'TASK-01', slot: 's1' });
  assert.equal((await h.call('apply_baseline', { backlogItemKey: 'TASK-01' })).error.code, 'NO_BASELINE_PATCH');
  const bdir = join(matchRoot, '.mtm-tmp', 'baseline');
  mkdirSync(bdir, { recursive: true });
  const outside = `diff --git a/README.md b/README.md\nnew file mode 100644\n--- /dev/null\n+++ b/README.md\n@@ -0,0 +1 @@\n+x\n`;
  writeFileSync(join(bdir, 'baseline.patch'), outside);
  assert.equal((await h.call('apply_baseline', { backlogItemKey: 'TASK-01' })).error.code, 'OUTSIDE_FOLDER');
  const f = `${gm.matchId}/src/migrations/002_restore_restrict.sql`;
  const good = `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1 @@\n+-- baseline repaired: restore RESTRICT\n`;
  writeFileSync(join(bdir, 'baseline.patch'), good);
  const before = remoteHead();
  const b = await h.call('apply_baseline', { backlogItemKey: 'TASK-01', summary: 'cascade test: restore RESTRICT' });
  assert.equal(b.status, 'APPLIED', JSON.stringify(b));
  assert.notEqual(remoteHead(), before);
  assert.equal(b.sha, remoteHead());
  assert.equal((await h.call('apply_baseline', { backlogItemKey: 'TASK-01' })).status, 'ALREADY_APPLIED');
  // The first item's slot was started before the repair and moves up to it before its worker starts.
  assert.deepEqual(b.syncedSlots, ['s1']);
  assert.ok(existsSync(join(s1.slotMatchRoot, 'src', 'migrations', '002_restore_restrict.sql')));
  assert.ok(existsSync(join(s1.slotMatchRoot, 'answers', 'TASK-01', 'submit.json')), 'answer folder kept');
  assert.equal(g(checkoutRoot, 'status', '--porcelain'), '');

  // Group: TASK-01 then BUG-01 in the same slot by the same worker.
  work(s1, 'TASK-01', { file: 'src/other.txt', content: 'task\n' });
  // The slot started before the baseline commit; integration brings both together.
  const i1 = await h.call('integrate_item', { backlogItemKey: 'TASK-01', next: 'BUG-01' });
  assert.equal(i1.status, 'SUBMITTED', JSON.stringify(i1));
  assert.equal(i1.next.slot, 's1');
  assert.equal(i1.next.backlogId, 'BUG-01');
  const s2 = i1.next;
  // The reused slot starts from the branch head: baseline + TASK-01 are there.
  assert.equal(readFileSync(join(s2.slotMatchRoot, 'src', 'other.txt'), 'utf8'), 'task\n');
  assert.match(readFileSync(join(s2.slotMatchRoot, 'src', 'migrations', '002_restore_restrict.sql'), 'utf8'), /baseline repaired/);
  assert.equal(JSON.parse(readFileSync(s2.briefFile, 'utf8')).baselineRepair.sha, b.sha);
  work(s2, 'BUG-01', { content: 'line1\nBUG\nline3\n' });
  const i2 = await h.call('integrate_item', { backlogItemKey: 'BUG-01' });
  assert.equal(i2.status, 'SUBMITTED', JSON.stringify(i2));
  assert.equal(i2.integratedCommits, 1);
  assert.equal(g(checkoutRoot, 'log', '--oneline', '--grep', 'TASK-01: fix').split('\n').length, 1, 'no duplicated commits');
  assert.equal(gm.state.submissions.get('BUG-01').body.gitRevision, remoteHead());

  // Work committed after integration is never silently thrown away by the next start_work.
  writeFileSync(join(s2.slotMatchRoot, 'src', 'late.txt'), 'late\n');
  g(s2.worktreeRoot, 'add', '--', gm.matchId); g(s2.worktreeRoot, 'commit', '-qm', 'late');
  assert.equal((await h.call('start_work', { backlogItemKey: 'CR-01', slot: 's1' })).error.code, 'SLOT_HAS_UNINTEGRATED_WORK');
  assert.equal((await h.call('release_slot', { slot: 's1' })).slot, 's1');
  const s3 = await h.call('start_work', { backlogItemKey: 'CR-01', slot: 's1' });
  assert.equal(s3.slot, 's1');
  assert.ok(!existsSync(join(s3.slotMatchRoot, 'src', 'late.txt')), 'released work is dropped deliberately');

  // Workers' own helper processes are never configured: Company Tools reach them through the orchestrator helper.
  const proxyFile = join(s3.slotMatchRoot, '.mtm-tmp', 'company-proxy.json');
  assert.ok(existsSync(proxyFile));
  assert.ok(!readFileSync(proxyFile, 'utf8').includes(gm.apiKey), 'the team key is never written');
  assert.ok(!g(checkoutRoot, 'status', '--porcelain', '--untracked-files=all').includes('company-proxy'));
  const w = new Helper();
  assert.equal((await w.call('company_tool_call', { name: 'search_logs', arguments: { query: 'x' } })).error.code, 'NOT_CONFIGURED');
  const viaList = await w.call('company_tools_list', { slotMatchRoot: s3.slotMatchRoot });
  assert.equal(viaList[0].name, 'search_logs');
  const via = await w.call('company_tool_call', { name: 'search_logs', arguments: { query: 'aging standard' }, backlogId: 'CR-01', slotMatchRoot: s3.slotMatchRoot });
  assert.match(via.text, /logs for aging standard/);
  const saved = await w.call('company_tool_call', { name: 'search_logs', arguments: { query: 'big' }, backlogId: 'CR-01', slotMatchRoot: s3.slotMatchRoot, saveToSlot: true });
  assert.ok(existsSync(saved.savedTo) && saved.savedTo.startsWith(s3.slotMatchRoot));
  const info = JSON.parse(readFileSync(proxyFile, 'utf8'));
  writeFileSync(proxyFile, JSON.stringify({ ...info, token: 'f'.repeat(48) }));
  assert.equal((await w.call('company_tool_call', { name: 'search_logs', arguments: {}, slotMatchRoot: s3.slotMatchRoot })).error.code, 'PROXY_TOKEN_REJECTED');
  writeFileSync(proxyFile, JSON.stringify(info));
  w.close();
  assert.ok(events().some(e => e.type === 'TOOL_ACTIVITY' && e.backlogId === 'CR-01'), 'relayed calls are logged by the orchestrator helper');
  h.close();
  for (const e of events()) assert.equal(validateEvent(e), null, JSON.stringify(e));
  assert.ok(!g(bare, 'branch', '--list').includes('mtm-slot'));
});
