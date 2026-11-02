// 1.6.0: integrate_item replays the organizer MVS file in the slot before pushing or submitting.
// Run: node --test tests/mvs.test.mjs  (needs vitest: VITEST_MODULES=<dir with node_modules/vitest>, default ../harness/.verify/node_modules)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  gm = await startMockGm({ matchId: 'MVSG0001' });
  tmp = mkdtempSync(join(tmpdir(), 'mld-mvs-test-'));
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
  writeFileSync(join(f, 'src', 'package.json'), '{"name":"mvs-fixture","private":true,"type":"module"}\n');
  mkdirSync(join(f, 'src', 'src', 'lib'), { recursive: true });
  writeFileSync(join(f, 'src', 'src', 'lib', 'sum.ts'), 'export function sum(a: number, b: number): number {\n  return a - b;\n}\n');
  writeFileSync(join(f, '.gitignore'), 'src/.env\nnode_modules\n');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  g(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed');
  g(seed, 'push', '-q', 'origin', 'main');
  checkoutRoot = join(ws, 'matches', gm.matchId);
  matchRoot = join(checkoutRoot, gm.matchId);
  mkdirSync(join(ws, 'team-sdlc-pack', 'logs'), { recursive: true });
  g(tmp, 'clone', '-q', bare, checkoutRoot);
  g(checkoutRoot, 'config', 'user.name', 'MLD'); g(checkoutRoot, 'config', 'user.email', 'mld@example.invalid');
  writeFileSync(join(matchRoot, 'src', '.env'), 'DATABASE_URL=postgres://app@127.0.0.1:5433/solova_MVSG0001\nPORT=3000\n');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-mvs', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-mvs', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-mvs', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-mvs', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-mvs', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
    apiKeySecret: gm.apiKey, apiKeyLength: Buffer.byteLength(gm.apiKey), apiKeySha256: createHash('sha256').update(gm.apiKey).digest('hex'),
    apiKeyScopes: ['backlogs:start', 'submissions:create'], gameMasterUrl: `${gm.origin}/`, matchPageUrl: `${gm.origin}/match`,
    allowedApiOrigins: [gm.origin], teamWorkspace: ws, challengeWorkspace: join(ws, 'matches'), teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack'),
    progressLogFile: logFile, environmentRevision: g(checkoutRoot, 'rev-parse', 'HEAD'), checkoutRoot, matchRoot };
});

after(async () => { await gm?.close?.(); rmSync(tmp, { recursive: true, force: true }); });

const MVS = `import { describe, expect, it } from "vitest";
import { sum } from "~/lib/sum";
describe("BUG-07-TC-01", () => { it("adds", () => { expect(sum(2, 3)).toBe(5); }); });
describe("BUG-07-TC-02", () => { it("zero", () => { expect(sum(0, 0)).toBe(0); }); });
`;
const MVS_MISSING = `import { expect, it } from "vitest";
import { phoneUrl } from "~/lib/contact-links";
it("CR-07-TC-01 phone", () => { expect(phoneUrl("0901234567")).toBe("tel:+84901234567"); });
`;
const vitestModules = process.env.VITEST_MODULES ?? join(packRoot, '..', 'harness', '.verify', 'node_modules');

function answer(slotRoot, key, rows) {
  const dir = join(slotRoot, 'answers', key); mkdirSync(join(dir, 'evidence'), { recursive: true });
  writeFileSync(join(dir, 'evidence', 'log.txt'), 'ok\n');
  writeFileSync(join(dir, 'submit.json'), JSON.stringify({ backlogId: key, status: 'DONE', changeSummary: 'x',
    testResults: rows.map(([id, result]) => ({ id, result, evidence: result === 'PASS' ? ['evidence/log.txt'] : [] })) }, null, 2));
}
const commit = (wt, msg) => { g(wt, '-c', 'user.name=w', '-c', 'user.email=w@w', 'add', '-A'); g(wt, '-c', 'user.name=w', '-c', 'user.email=w@w', 'commit', '-qm', msg); };

test('MVS replay gate in integrate_item', { skip: !existsSync(join(vitestModules, 'vitest')) && 'vitest not available' }, async () => {
  gm.state.backlog = [
    { key: 'BUG-07', backlogType: 'BUG', title: 'Sum is wrong', deadlineMinutes: null, revisionNo: 1, workStatus: 'NOT_STARTED', files: { 'challenge/BUG-07-mvs.test.ts': MVS } },
    { key: 'CR-07', backlogType: 'CR', title: 'Contact links', deadlineMinutes: null, revisionNo: 1, workStatus: 'NOT_STARTED', files: { 'challenge/CR-07-mvs.test.ts': MVS_MISSING } }
  ];
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    await h.call('prepare_slots', { count: 2, copyFiles: ['src/.env'] });
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    const s = await h.call('start_work', { backlogItemKey: 'BUG-07', slot: 's1' });
    const app = join(s.slotMatchRoot, 'src');
    symlinkSync(vitestModules, join(app, 'node_modules'), 'junction');
    // The mock template has one row; the organizer MVS has two cases (TC-01, TC-02): the gate maps by row id.
    answer(s.slotMatchRoot, 'BUG-07', [['BUG-07-TC-01', 'PASS']]);
    commit(s.worktreeRoot, 'BUG-07: claim');
    const bad = await h.call('integrate_item', { backlogItemKey: 'BUG-07' });
    assert.equal(bad.error?.code, 'MVS_FAILING', JSON.stringify(bad).slice(0, 400));
    assert.deepEqual(bad.error.details.rows, ['BUG-07-TC-01']);
    assert.match(JSON.stringify(bad.error.details.failing), /expected -1 to be 5/);
    assert.ok(!gm.state.submissions.has('BUG-07'), 'nothing submitted');
    const check = JSON.parse(readFileSync(join(s.slotMatchRoot, '.mtm-tmp', 'BUG-07', 'mvs-check.json'), 'utf8'));
    assert.equal(check.status, 'FAILED'); assert.equal(check.stage, 1);
    // Fix the code: the replay passes and the item is submitted with mvsCheck in the result.
    writeFileSync(join(app, 'src', 'lib', 'sum.ts'), 'export function sum(a: number, b: number): number {\n  return a + b;\n}\n');
    commit(s.worktreeRoot, 'BUG-07: fix');
    const ok = await h.call('integrate_item', { backlogItemKey: 'BUG-07' });
    assert.equal(ok.status, 'SUBMITTED', JSON.stringify(ok).slice(0, 400));
    assert.equal(ok.mvsCheck.status, 'PASSED'); assert.deepEqual(ok.mvsCheck.rows['BUG-07-TC-01'], { passed: 1, failed: 0 });
    // Module missing while a row claims PASS: MVS_NOT_RUNNABLE (stage 2 also fails to load); allowMvsFailure overrides.
    const s2 = await h.call('start_work', { backlogItemKey: 'CR-07', slot: 's2' });
    symlinkSync(vitestModules, join(s2.slotMatchRoot, 'src', 'node_modules'), 'junction');
    answer(s2.slotMatchRoot, 'CR-07', [['CR-07-TC-01', 'PASS']]);
    commit(s2.worktreeRoot, 'CR-07: claim');
    const nr = await h.call('integrate_item', { backlogItemKey: 'CR-07' });
    assert.equal(nr.error?.code, 'MVS_NOT_RUNNABLE', JSON.stringify(nr).slice(0, 400));
    const forced = await h.call('integrate_item', { backlogItemKey: 'CR-07', allowMvsFailure: true });
    assert.equal(forced.status, 'SUBMITTED', JSON.stringify(forced).slice(0, 400));
    assert.equal(forced.mvsCheck.overridden, true);
    assert.ok(!existsSync(join(s2.slotMatchRoot, 'src', 'tests', 'mtm-mvs-cr-07.test.ts')), 'stage-2 copy removed');
  } finally { h.close(); }
});
