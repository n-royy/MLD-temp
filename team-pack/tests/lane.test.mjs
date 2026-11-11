// 1.5.27: fast lane (s5/s6 for PIs and short TASKs), helper rescue before a deadline, stalled-slot warning.
// Run: node --test tests/lane.test.mjs
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
  constructor(extra = {}) {
    this.child = spawn(process.execPath, [join(packRoot, 'bin', 'runtime-server.mjs')],
      { env: { MTM_AUTO_INTEGRATE: '0', MTM_SOON_MINUTES: '3', MTM_RESCUE_MINUTES: '-1', ...process.env, MTM_HELPER_ALLOW_LOOPBACK: '1', ...extra }, stdio: ['pipe', 'pipe', 'inherit'] });
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
  gm = await startMockGm({ matchId: 'LANE0001' });
  tmp = mkdtempSync(join(tmpdir(), 'mld-lane-test-'));
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
  writeFileSync(join(matchRoot, 'src', '.env'), 'DATABASE_URL=postgres://app@127.0.0.1:5433/solova_LANE0001\nPORT=3000\n');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-lane', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-lane', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-lane', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-lane', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-lane', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
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

const item = (key, type, extra = {}) => ({ key, backlogType: type, title: key, deadlineMinutes: null, revealedElapsedSec: 0,
  revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x', ...extra });
const wake = async (h, want, tries = 8) => {
  for (let i = 0; i < tries; i++) { const w = await h.call('wait_for_update', { timeoutMs: 20000 }); if (want(w)) return w; }
  return null;
};

test('the fast lane takes PIs and short TASKs only; long items are refused with a free worker slot', async () => {
  gm.state.backlog = [item('TASK-60', 'TASK'), item('CR-60', 'CR', { description: 'Rework the whole export module.\n'.repeat(40) })];
  gm.state.clock = { elapsedSec: 300, remainingSec: 2100 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    assert.equal((await h.call('prepare_slots', { count: 6 })).slots.length, 6);
    await h.call('configure_session', { descriptors: [prepare, start] });
    const board = await h.call('refresh_match');
    assert.deepEqual(board.slots.map(s => s.role), ['worker', 'worker', 'worker', 'worker', 'fast-lane', 'fast-lane']);
    const refused = await h.call('start_work', { backlogItemKey: 'CR-60', slot: 's5' });
    assert.equal(refused.error?.code, 'FAST_LANE_SHORT_ONLY', JSON.stringify(refused).slice(0, 300));
    assert.ok(!gm.state.started.has('CR-60'), 'refused before Start Work is sent');
    const t = await h.call('start_work', { backlogItemKey: 'TASK-60', slot: 's5' });
    assert.ok(t.briefFile, JSON.stringify(t).slice(0, 300));
    const brief = JSON.parse(readFileSync(t.briefFile, 'utf8'));
    assert.ok(brief.budgetMinutes > 0 && Date.parse(brief.wrapUpBy) > Date.now(), JSON.stringify(brief).slice(0, 300));
    writeFileSync(t.doneFile, JSON.stringify({ status: 'DONE', summary: 'done', tests: { required: 0, executed: 1, passed: 1, failed: 0 } }));
    const w = await wake(h, x => x.reason === 'SLOT_DONE');
    const e = w?.slotDone.find(d => d.item === 'TASK-60');
    assert.ok(e, JSON.stringify(w).slice(0, 300));
    // The only open item is long: the fast lane stays free for the next PI.
    assert.equal(e.suggestNext?.backlogItemKey ?? null, null, JSON.stringify(e.suggestNext));
    await h.call('release_slot', { slot: 's5' });
  } finally { h.close(); }
});

test('rescue: an item still in its slot 2.5 minutes before its deadline is committed and submitted as an honest PARTIAL', async () => {
  gm.state.backlog = [item('TASK-61', 'TASK', { deadlineMinutes: 10, revealedElapsedSec: 600 })];
  gm.state.clock = { elapsedSec: 700, remainingSec: 1700 };
  const h = new Helper({ MTM_AUTO_INTEGRATE: '1', MTM_RESCUE_MINUTES: '2.5' });
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    const s = await h.call('start_work', { backlogItemKey: 'TASK-61', slot: 's1' });
    assert.ok(s.briefFile, JSON.stringify(s).slice(0, 300));
    // The worker changed the source but never committed and wrote no answer (R7WFBQBT CR-07).
    writeFileSync(join(s.slotMatchRoot, 'src', 'app.txt'), 'line1\nline2 fixed\nline3\n');
    gm.state.clock = { elapsedSec: 1050, remainingSec: 1350 }; // 2 minutes to the deadline
    gm.state.sequence++;
    const w = await wake(h, x => x.reason === 'AUTO_SUBMITTED');
    assert.ok(w, 'AUTO_SUBMITTED');
    const r = w.autoSubmitted.find(a => a.item === 'TASK-61');
    assert.ok(r && r.rescued === true && ['template', 'repaired'].includes(r.answer), JSON.stringify(w.autoSubmitted));
    assert.equal(r.status, 'SUBMITTED', JSON.stringify(r));
    const sub = gm.state.submissions.get('TASK-61');
    assert.ok(sub, 'submitted to the Game Master');
    assert.equal(sub.body.answer.status, 'PARTIAL');
    assert.equal(sub.body.answer.testResults[0].result, 'NOT_RUN');
    // The uncommitted fix is on the submitted revision.
    assert.match(g(bare, 'show', `${sub.body.gitRevision}:${gm.matchId}/src/app.txt`), /line2 fixed/);
  } finally { h.close(); }
});

test('SLOT_STALLED: a busy slot where nothing is written for the stall time is reported once', async () => {
  gm.state.backlog = [item('CR-62', 'CR')];
  gm.state.clock = { elapsedSec: 1200, remainingSec: 1200 };
  const h = new Helper({ MTM_STALL_MINUTES: '0.05' });
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    for (const slot of ['s1', 's2']) await h.call('release_slot', { slot }).catch(() => null);
    const s = await h.call('start_work', { backlogItemKey: 'CR-62', slot: 's2' });
    assert.ok(s.briefFile, JSON.stringify(s).slice(0, 300));
    await new Promise(r => setTimeout(r, 4000));
    const w = await wake(h, x => x.reason === 'SLOT_STALLED', 4);
    assert.ok(w, 'SLOT_STALLED');
    assert.deepEqual(w.stalled.map(x => [x.slot, x.item]), [['s2', 'CR-62']]);
    const again = await h.call('wait_for_update', { noWait: true });
    assert.notEqual(again.reason, 'SLOT_STALLED', 'reported once');
  } finally { h.close(); }
});

test('1.5.27: a suite item whose Spec boxes carry a copied proof is not auto-submitted; SLOT_DONE names the boxes', async () => {
  gm.state.backlog = [item('TASK-63', 'TASK', { description: '## Requirements\n1. Write an integration test suite for `challenge/TASK-63-spec.md`.\n## Grading\nYour suite is run against builds that each break one part of the specification: it earns a detection share for each broken build it fails on.' })];
  gm.state.clock = { elapsedSec: 600, remainingSec: 1800 };
  const h = new Helper({ MTM_AUTO_INTEGRATE: '1' });
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    const board = await h.call('refresh_match');
    assert.equal(board.items.find(i => i.key === 'TASK-63').effort?.level ?? 'L', 'L');
    for (const slot of ['s1', 's2', 's3', 's4', 's5', 's6']) await h.call('release_slot', { slot }).catch(() => null);
    const s = await h.call('start_work', { backlogItemKey: 'TASK-63', slot: 's3' });
    assert.ok(s.briefFile, JSON.stringify(s).slice(0, 300));
    const same = ' - proof: 40 cases pass; 20 mutants detected.';
    writeFileSync(s.checklistFile, ['# TASK-63 checklist', '', '## Spec TASK-63-spec.md: constraints on every rule',
      `- [x] C1 Every rule holds for any number of lines.${same}`, '', '## Spec TASK-63-spec.md: T. Transfers',
      `- [x] C2 T1 one counterpart.${same}`, `- [x] C3 T3 date stays.${same}`, ''].join('\n'));
    work(s, 'TASK-63', { file: 'src/suite.txt', content: 'suite\n', done: false });
    writeFileSync(s.doneFile, JSON.stringify({ status: 'DONE', summary: 'suite', tests: { required: 1, executed: 1, passed: 1, failed: 0 },
      qualityGate: { kind: 'SUITE_DETECTION', status: 'PASS', summary: '20 mutants' } }));
    const w = await wake(h, x => ['SLOT_DONE', 'AUTO_SUBMITTED'].includes(x.reason));
    assert.equal(w?.reason, 'SLOT_DONE', JSON.stringify(w).slice(0, 400));
    const e = w.slotDone.find(d => d.item === 'TASK-63');
    assert.deepEqual(e.checklistOpen, ['C1 copied proof', 'C2 copied proof', 'C3 copied proof']);
    assert.ok(!gm.state.submissions.has('TASK-63'), 'left to the orchestrator');
    await h.call('release_slot', { slot: 's3' });
  } finally { h.close(); }
});

test('1.5.29: integration refuses conflict markers and tests that read the slot scratch; overlaps are reported', async () => {
  gm.state.backlog = [item('BUG-70', 'BUG'), item('BUG-71', 'BUG'), item('BUG-72', 'BUG')];
  gm.state.clock = { elapsedSec: 900, remainingSec: 1500 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    for (const slot of ['s1', 's2', 's3', 's4', 's5', 's6']) await h.call('release_slot', { slot }).catch(() => null);
    const a = await h.call('start_work', { backlogItemKey: 'BUG-70', slot: 's1' });
    const b = await h.call('start_work', { backlogItemKey: 'BUG-71', slot: 's2' });
    const c = await h.call('start_work', { backlogItemKey: 'BUG-72', slot: 's3' });
    // s1: a "resolved" file that still carries markers.
    work(a, 'BUG-70', { content: 'line1\n<<<<<<< HEAD\nline2 a\n=======\nline2 b\n>>>>>>> x\nline3\n' });
    const marked = await h.call('integrate_item', { backlogItemKey: 'BUG-70' });
    assert.equal(marked.error?.code, 'CONFLICT_MARKERS', JSON.stringify(marked).slice(0, 300));
    // s2: a test reading the slot scratch.
    mkdirSync(join(b.slotMatchRoot, 'src', 'tests'), { recursive: true });
    writeFileSync(join(b.slotMatchRoot, 'src', 'tests', 'official.test.ts'), "const zip = '../../.mtm-tmp/BUG-71/official.zip';\n");
    work(b, 'BUG-71', { content: 'line1\nline2 by 71\nline3\n' });
    const local = await h.call('integrate_item', { backlogItemKey: 'BUG-71' });
    assert.equal(local.error?.code, 'TEST_USES_LOCAL_FILES', JSON.stringify(local).slice(0, 300));
    // s3 lands a change to src/app.txt, which s1 and s2 changed too: both are named.
    work(c, 'BUG-72', { content: 'line1\nline2 by 72\nline3\n' });
    const ok = await h.call('integrate_item', { backlogItemKey: 'BUG-72' });
    assert.equal(ok.status, 'SUBMITTED', JSON.stringify(ok).slice(0, 300));
    assert.deepEqual((ok.overlaps ?? []).map(o => o.slot).sort(), ['s1', 's2'], JSON.stringify(ok.overlaps));
    assert.ok(ok.overlaps.every(o => o.files.some(f => f.endsWith('src/app.txt'))));
    assert.doesNotMatch(g(bare, 'show', `main:${gm.matchId}/src/app.txt`), /<<<<<<<|>>>>>>>/);
    for (const slot of ['s1', 's2']) await h.call('release_slot', { slot });
  } finally { h.close(); }
});

test('1.5.29: a rescue in the middle of a conflicted rebase aborts it and submits without conflict markers', async () => {
  gm.state.backlog = [item('BUG-73', 'BUG', { deadlineMinutes: 10, revealedElapsedSec: 1000 }), item('BUG-74', 'BUG')];
  gm.state.clock = { elapsedSec: 1100, remainingSec: 1300 };
  const h = new Helper({ MTM_AUTO_INTEGRATE: '1', MTM_RESCUE_MINUTES: '2.5' });
  try {
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    for (const slot of ['s1', 's2', 's3', 's4', 's5', 's6']) await h.call('release_slot', { slot }).catch(() => null);
    const a = await h.call('start_work', { backlogItemKey: 'BUG-73', slot: 's1' });
    const b = await h.call('start_work', { backlogItemKey: 'BUG-74', slot: 's2' });
    work(a, 'BUG-73', { content: 'line1\nline2 by 73\nline3\n', done: false });
    work(b, 'BUG-74', { content: 'line1\nline2 by 74\nline3\n', done: false });
    assert.equal((await h.call('integrate_item', { backlogItemKey: 'BUG-74' })).status, 'SUBMITTED');
    // The worker of s1 starts the rebase the orchestrator asked for and stops in the middle of the conflict.
    let failed = false;
    try { g(a.worktreeRoot, 'rebase', 'main'); } catch { failed = true; }
    assert.ok(failed, 'the rebase stops on the conflict');
    assert.match(readFileSync(join(a.slotMatchRoot, 'src', 'app.txt'), 'utf8'), /<<<<<<</);
    gm.state.clock = { elapsedSec: 1490, remainingSec: 910 }; // 1.8 minutes to the deadline
    gm.state.sequence++;
    const w = await wake(h, x => x.reason === 'AUTO_SUBMITTED');
    const r = w?.autoSubmitted.find(x => x.item === 'BUG-73');
    assert.ok(r && r.rescued && r.status === 'SUBMITTED', JSON.stringify(w?.autoSubmitted ?? w).slice(0, 400));
    const sub = gm.state.submissions.get('BUG-73');
    const text = g(bare, 'show', `${sub.body.gitRevision}:${gm.matchId}/src/app.txt`);
    assert.doesNotMatch(text, /<<<<<<<|=======|>>>>>>>/);
    assert.match(text, /line2 by 74/, 'the branch side of the conflicting line is kept');
  } finally { h.close(); }
});
