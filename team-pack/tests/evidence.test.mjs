// 1.6.1: required evidence from the MVS file (parser, validator output) and the integrate_item gates
// REQUIRED_EVIDENCE_MISSING / EARLY_PARTIAL / acceptGaps. Run: node --test tests/evidence.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockGm } from './mock-gm.mjs';
import { requiredEvidence, evidenceGaps } from '../src/evidence.mjs';
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
  gm = await startMockGm({ matchId: 'EVID0001' });
  tmp = mkdtempSync(join(tmpdir(), 'mld-evid-test-'));
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
  writeFileSync(join(matchRoot, 'src', '.env'), 'DATABASE_URL=postgres://app@127.0.0.1:5433/solova_EVID0001\nPORT=3000\n');
  logFile = join(ws, 'team-sdlc-pack', 'logs', `${gm.matchId}.progress.ndjson`);
  writeFileSync(logFile, JSON.stringify({ schemaVersion: 1, playerSessionId: 'session-evid', type: 'ORCHESTRATOR_STARTED', summary: 'Team orchestrator started.' }) + '\n');
  const repository = { url: 'https://github.com/example/repo.git', branch: 'main', folder: gm.matchId };
  prepare = { schemaVersion: 1, playerSessionId: 'session-evid', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'PREPARE_GAME', requestId: 'prepare-evid', username: gm.user, password: gm.pass, matchPageUrl: `${gm.origin}/match`,
    allowedMatchOrigins: [gm.origin], repository, checkoutRoot, matchRoot, progressLogFile: logFile, teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack') };
  start = { schemaVersion: 1, playerSessionId: 'session-evid', teamId: 'MLD', teamName: 'Megalodon', matchId: gm.matchId,
    type: 'START_GAME', requestId: 'start-evid', teamUuid: '22222222-2222-4222-8222-222222222222', gameMasterApiUrl: `${gm.origin}/`,
    apiKeySecret: gm.apiKey, apiKeyLength: Buffer.byteLength(gm.apiKey), apiKeySha256: createHash('sha256').update(gm.apiKey).digest('hex'),
    apiKeyScopes: ['backlogs:start', 'submissions:create'], gameMasterUrl: `${gm.origin}/`, matchPageUrl: `${gm.origin}/match`,
    allowedApiOrigins: [gm.origin], teamWorkspace: ws, challengeWorkspace: join(ws, 'matches'), teamSdlcPackWorkspace: join(ws, 'team-sdlc-pack'),
    progressLogFile: logFile, environmentRevision: g(checkoutRoot, 'rev-parse', 'HEAD'), checkoutRoot, matchRoot };
});

after(async () => { await gm?.close?.(); rmSync(tmp, { recursive: true, force: true }); });

const md = key => `# ${key} minimum verification scenarios

## General evidence (required once)

| File | Content |
|---|---|
| \`before-${key.toLowerCase()}.png\` | page before the change |

## ${key}-TC-01 – one company

1. Select company A, click Export CSV (see \`other-file.json\` for data).

Required evidence:
- \`tc-01-x.png\`: the filter set to company A.
- \`tc-01-x.csv\`: the downloaded file.
`;
function answer(slotRoot, key, result, evidence, files = []) {
  const dir = join(slotRoot, 'answers', key); mkdirSync(join(dir, 'evidence'), { recursive: true });
  for (const f of ['log.txt', ...files]) writeFileSync(join(dir, 'evidence', f), 'x\n');
  writeFileSync(join(dir, 'submit.json'), JSON.stringify({ backlogId: key, status: result === 'PASS' ? 'DONE' : 'PARTIAL', changeSummary: 'x',
    testResults: [{ id: `${key}-TC-01`, result, evidence }] }, null, 2));
}
const commit = (wt, msg) => { g(wt, '-c', 'user.name=w', '-c', 'user.email=w@w', 'add', '-A'); g(wt, '-c', 'user.name=w', '-c', 'user.email=w@w', 'commit', '-qm', msg); };

test('parser: real MVS shapes', () => {
  const r = requiredEvidence(md('CR-08'));
  assert.deepEqual(r.rows, { 'CR-08-TC-01': ['tc-01-x.png', 'tc-01-x.csv'] });
  assert.deepEqual(r.general, ['before-cr-08.png']);
  const inline = requiredEvidence('## BUG-02-TC-01 – VND invoice\n\nRequired evidence: `tc-01-vnd-invoice.png`, `currency-report.txt`.\n\n## BUG-01-TC-03\n\nRequired evidence (screenshot): tc-03-mobile-dashboard.png and tc-03-mobile-accounting.png\n');
  assert.deepEqual(inline.rows, { 'BUG-02-TC-01': ['tc-01-vnd-invoice.png', 'currency-report.txt'], 'BUG-01-TC-03': ['tc-03-mobile-dashboard.png', 'tc-03-mobile-accounting.png'] });
  const gaps = evidenceGaps({ testResults: [{ id: 'CR-08-TC-01', result: 'PASS', evidence: ['evidence/tc-01-x.png'] }] }, r, f => f === 'tc-01-x.png');
  assert.deepEqual(gaps.passMissing, [{ row: 'CR-08-TC-01', missing: ['tc-01-x.csv'] }]);
  assert.deepEqual(gaps.generalMissing, ['before-cr-08.png']);
});

test('integrate_item evidence gates', async () => {
  gm.state.backlog = ['CR-08', 'CR-09'].map(key => ({ key, backlogType: 'CR', title: `Export ${key}`, deadlineMinutes: null, revealedElapsedSec: 0,
    revisionNo: 1, workStatus: 'NOT_STARTED', files: { [`challenge/${key}-minimum-verification-scenarios.md`]: md(key) } }));
  gm.state.clock = { elapsedSec: 600, remainingSec: 1800 };
  const h = new Helper();
  try {
    await h.call('configure_session', { descriptors: [prepare] });
    await h.call('prepare_slots', { count: 2, copyFiles: ['src/.env'] });
    await h.call('configure_session', { descriptors: [prepare, start] });
    await h.call('refresh_match');
    const s = await h.call('start_work', { backlogItemKey: 'CR-08', slot: 's1' });
    assert.ok(existsSync(join(s.slotMatchRoot, '.mtm-tmp', 'tools', 'ui-run.mjs')), 'ui-run shipped into the slot');
    // PASS without the required files.
    answer(s.slotMatchRoot, 'CR-08', 'PASS', ['evidence/log.txt']);
    commit(s.worktreeRoot, 'CR-08: claim');
    const v = JSON.parse(execFileSync(process.execPath, [join(s.slotMatchRoot, '.mtm-tmp', 'CR-08', 'validate.mjs')], { encoding: 'utf8' }));
    assert.deepEqual(v.requiredEvidence.passMissing, [{ row: 'CR-08-TC-01', missing: ['tc-01-x.png', 'tc-01-x.csv'] }], 'validator shows the gaps');
    const e1 = await h.call('integrate_item', { backlogItemKey: 'CR-08' });
    assert.equal(e1.error?.code, 'REQUIRED_EVIDENCE_MISSING', JSON.stringify(e1).slice(0, 300));
    // Honest NOT_RUN with 30 minutes left: EARLY_PARTIAL with the missing list.
    answer(s.slotMatchRoot, 'CR-08', 'NOT_RUN', []);
    commit(s.worktreeRoot, 'CR-08: honest');
    const e2 = await h.call('integrate_item', { backlogItemKey: 'CR-08' });
    assert.equal(e2.error?.code, 'EARLY_PARTIAL');
    assert.ok(e2.error.details.minutesLeft > 25);
    assert.deepEqual(e2.error.details.open, [{ row: 'CR-08-TC-01', result: 'NOT_RUN', missing: ['tc-01-x.png', 'tc-01-x.csv'] }]);
    assert.equal((await h.call('integrate_item', { backlogItemKey: 'CR-08', acceptGaps: 'blocked' })).error?.code, 'INVALID_ACCEPT_GAPS');
    const ok1 = await h.call('integrate_item', { backlogItemKey: 'CR-08', acceptGaps: 'the export button does not exist in this build' });
    assert.equal(ok1.status, 'SUBMITTED', JSON.stringify(ok1).slice(0, 300));
    assert.equal(ok1.evidenceCheck.status, 'ACCEPTED_GAPS');
    // Complete evidence: integrates without any override.
    const s2 = await h.call('start_work', { backlogItemKey: 'CR-09', slot: 's2' });
    answer(s2.slotMatchRoot, 'CR-09', 'PASS', ['evidence/tc-01-x.png', 'evidence/tc-01-x.csv'], ['tc-01-x.png', 'tc-01-x.csv', 'before-cr-09.png']);
    commit(s2.worktreeRoot, 'CR-09: done');
    const ok2 = await h.call('integrate_item', { backlogItemKey: 'CR-09' });
    assert.equal(ok2.status, 'SUBMITTED', JSON.stringify(ok2).slice(0, 300));
    assert.equal(ok2.evidenceCheck.status, 'OK');
  } finally { h.close(); }
});
