// 1.5.3: DEADLINE_SOON wake-up (deadline and match end), compact board with minutesLeft, orchestrator slot s4.
// Run: node --test tests/deadline.test.mjs
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
    if (process.env.TRACE) console.error('CALL', name, new Date().toISOString().slice(11,19));
    const msg = await this.rpc('tools/call', { name, arguments: args });
    const payload = JSON.parse(msg.result.content[0].text);
    return msg.result.isError ? { error: payload.error } : payload;
  }
  close() { this.child.stdin.end(); this.child.kill(); }
}

before(async () => {
  gm = await startMockGm({ matchId: 'DLNE0001' });
  tmp = mkdtempSync(join(tmpdir(), 'mld-deadline-test-'));
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
  writeFileSync(join(matchRoot, 'src', '.env'), 'DATABASE_URL=postgres://app@127.0.0.1:5433/solova_DLNE0001\nPORT=3000\n');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-deadline', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-deadline', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-deadline', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-deadline', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-deadline', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
    apiKeySecret: gm.apiKey, apiKeyLength: Buffer.byteLength(gm.apiKey), apiKeySha256: createHash('sha256').update(gm.apiKey).digest('hex'),
    apiKeyScopes: ['backlogs:start', 'submissions:create'], gameMasterUrl: `${gm.origin}/`, matchPageUrl: `${gm.origin}/match`,
    allowedApiOrigins: [gm.origin], teamWorkspace: ws, challengeWorkspace: join(ws, 'matches'), teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack'),
    progressLogFile: logFile, environmentRevision: g(checkoutRoot, 'rev-parse', 'HEAD'), checkoutRoot, matchRoot };
});

after(async () => { await gm?.close?.(); rmSync(tmp, { recursive: true, force: true }); });

test('DEADLINE_SOON wakes once per busy item, board is compact, s4 is the orchestrator slot', async () => {
  gm.state.backlog = [
    { key: 'BUG-09', backlogType: 'BUG', title: 'Status badge wrong', deadlineMinutes: 10, revealedElapsedSec: 0, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'x'.repeat(2000), submission: null },
    { key: 'CR-09', backlogType: 'CR', title: 'Aging report', deadlineMinutes: null, revealedElapsedSec: 0, revisionNo: 1, workStatus: 'NOT_STARTED', description: 'long text' }
  ];
  gm.state.clock = { elapsedSec: 450, remainingSec: 1950 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    const slots = await h.call('prepare_slots', { count: 4, copyFiles: ['src/.env'] });
    assert.equal(slots.slots?.length ?? slots.length ?? 4, 4);
    await h.call('configure_session', { descriptors: [prepare, start] });
    const board = await h.call('refresh_match');
    const bug = board.items.find(i => i.key === 'BUG-09');
    assert.equal(bug.description, undefined, 'descriptions stay out of the board');
    assert.ok(Math.abs(bug.minutesLeft - 2.5) < 0.2, `minutesLeft ${bug.minutesLeft}`);
    assert.equal(board.items.find(i => i.key === 'CR-09').minutesLeft, undefined);
    assert.ok(Math.abs(board.match.minutesLeft - 32.5) < 0.2);
    assert.ok(board.slots.some(s => s.slot === 's4' && s.role === 'orchestrator'));
    assert.ok(JSON.stringify(board).length < 2000, `board ${JSON.stringify(board).length} chars`);
    // 1.5.9: s4 is the orchestrator's slot for PI and value TASKs; a BUG or CR goes to a worker slot.
    const own = await h.call('start_work', { backlogItemKey: 'BUG-09', slot: 's4' });
    assert.equal(own.error?.code, 'OWN_SLOT_RESERVED'); assert.equal(own.error.details.freeWorkerSlot, 's1');
    const s = await h.call('start_work', { backlogItemKey: 'BUG-09', slot: 's1' });
    assert.ok(s.briefFile, JSON.stringify(s));
    const t0 = Date.now();
    const w1 = await h.call('wait_for_update', {});
    assert.equal(w1.reason, 'DEADLINE_SOON');
    assert.deepEqual(w1.deadlineSoon.map(d => [d.backlogItemKey, d.slot, d.kind]), [['BUG-09', 's1', 'DEADLINE']]);
    // 1.5.9: the board in every wake-up is compact: decision fields only, no ids, endpoints or team.
    const wb = w1.board;
    assert.deepEqual(Object.keys(wb.items[0]).filter(k => !['key', 'type', 'title', 'status', 'workStatus', 'points', 'deadlineMinutes', 'minutesLeft', 'submitted', 'heavy', 'slot', 'revisionNo'].includes(k)), []);
    assert.equal(wb.items.find(i => i.key === 'BUG-09').slot, 's1');
    assert.equal(wb.endpoints, undefined); assert.equal(wb.team, undefined);
    assert.ok(JSON.stringify(wb).length < 1200, `compact board ${JSON.stringify(wb).length} chars`);
    assert.ok(Date.now() - t0 < 8000, 'immediate');
    // Safety net: right after DEADLINE_SOON a short wait is honoured (no DONE.json yet -> TIMEOUT after ~5 s).
    const t1 = Date.now();
    const short = await h.call('wait_for_update', { timeoutMs: 5000 });
    assert.equal(short.reason, 'TIMEOUT');
    assert.ok(Date.now() - t1 < 15000, `short wait took ${Date.now() - t1} ms`);
    // Match end 2.5 minutes away: reported once more for the same busy item, as MATCH_END.
    gm.state.clock = { elapsedSec: 2250, remainingSec: 150 };
    gm.state.sequence++;
    const w2 = await h.call('wait_for_update', {});
    const w2b = w2.reason === 'MATCH_UPDATED' ? await h.call('wait_for_update', {}) : w2;
    assert.equal(w2b.reason, 'DEADLINE_SOON', JSON.stringify(w2b).slice(0, 300));
    assert.equal(w2b.deadlineSoon[0].kind, 'MATCH_END');
    // Nothing is reported twice: the next wake-up is a real change.
    gm.state.sequence++;
    const w3 = await h.call('wait_for_update', {});
    assert.equal(w3.reason, 'MATCH_UPDATED');
    // 1.5.4: a background job from preparation that ended wakes the orchestrator once (prep-* jobs never).
    const jobs = join(matchRoot, '.mtm-tmp', 'jobs'); mkdirSync(jobs, { recursive: true });
    for (const [n, code] of [['baseline', '1'], ['prep-build', '0']]) {
      writeFileSync(join(jobs, `${n}.pid`), '999999'); writeFileSync(join(jobs, `${n}.exit`), code);
      writeFileSync(join(jobs, `${n}.log`), 'Tests  1 failed | 11 passed (12)\n');
    }
    const w4 = await h.call('wait_for_update', {});
    assert.equal(w4.reason, 'JOBS_DONE');
    assert.deepEqual(w4.jobs.map(j => [j.name, j.state, j.exit]), [['baseline', 'FAILED', 1]]);
    assert.match(w4.jobs[0].tail, /1 failed/);
    const s2 = await h.call('start_work', { backlogItemKey: 'CR-09', slot: 's2' });
    const brief = JSON.parse(readFileSync(s2.briefFile, 'utf8'));
    assert.equal(brief.jobsDir, jobs); assert.equal(brief.slotInstallJob, 'install-s2'); assert.equal(brief.slotInstallState, 'MISSING');
    await h.call('release_slot', { slot: 's2' }); // otherwise CR-09 gets its own MATCH_END warning
    gm.state.sequence++;
    assert.equal((await h.call('wait_for_update', {})).reason, 'MATCH_UPDATED', 'reported once');
  } finally { h.close(); }
});
