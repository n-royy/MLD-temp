// 1.5.4: start_jobs / wait_jobs through the MCP helper (no session needed): detached jobs, exit codes, idempotency,
// LOST restart, path guard, one blocking call instead of polling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
class Helper {
  constructor(env = {}) {
    this.child = spawn(process.execPath, [join(packRoot, 'bin', 'runtime-server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...env } });
    this.next = 1; this.pending = new Map(); this.buf = '';
    this.child.stdout.on('data', d => { this.buf += d; let i; while ((i = this.buf.indexOf('\n')) >= 0) { const m = JSON.parse(this.buf.slice(0, i)); this.buf = this.buf.slice(i + 1); this.pending.get(m.id)?.(m); this.pending.delete(m.id); } });
  }
  async call(name, args = {}) {
    const id = this.next++;
    const msg = await new Promise(r => { this.pending.set(id, r); this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n'); });
    const p = JSON.parse(msg.result.content[0].text); return msg.result.isError ? { error: p.error } : p;
  }
  close() { this.child.stdin.end(); this.child.kill(); }
}

test('start_jobs and wait_jobs', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mld-jobs-'));
  const dir = join(tmp, 'm', '.mtm-tmp', 'jobs'); const cwd = join(tmp, 'm'); mkdirSync(cwd, { recursive: true });
  const h = new Helper();
  try {
    assert.equal((await h.call('start_jobs', { dir: join(tmp, 'jobs'), jobs: [{ name: 'a', cwd, command: 'true' }] })).error.code, 'INVALID_JOB_DIR');
    const s = await h.call('start_jobs', { dir, jobs: [
      { name: 'build', cwd, command: 'sleep 3; echo built' },
      { name: 'tests', cwd, command: 'echo "1 failed"; exit 3' },
      { name: 'slot-s1', cwd, command: 'sleep 1; echo installed' }] });
    assert.deepEqual(s.jobs.map(j => [j.started, j.mode]), [[true, 'runner'], [true, 'runner'], [true, 'runner']]);
    assert.equal(s.jobs[0].state, 'RUNNING'); // states are re-read after the 1.5 s launch check
    const t0 = Date.now();
    const w = await h.call('wait_jobs', { dir, timeoutMs: 20000 });
    assert.ok(w.done, JSON.stringify(w));
    assert.ok(Date.now() - t0 < 8000, 'returns as soon as the jobs end');
    const by = Object.fromEntries(w.jobs.map(j => [j.name, j]));
    assert.equal(by.build.state, 'DONE'); assert.match(by.build.tail, /built/);
    assert.equal(by.tests.state, 'FAILED'); assert.equal(by.tests.exit, 3); assert.match(by.tests.tail, /1 failed/);
    // Idempotent: DONE and FAILED are not restarted; restartFailed restarts the failed one.
    const again = await h.call('start_jobs', { dir, jobs: [{ name: 'build', cwd, command: 'echo twice' }, { name: 'tests', cwd, command: 'echo ok' }] });
    assert.deepEqual(again.jobs.map(j => j.started), [false, false]);
    const re = await h.call('start_jobs', { dir, restartFailed: true, jobs: [{ name: 'tests', cwd, command: 'echo ok' }] });
    assert.equal(re.jobs[0].started, true);
    assert.equal((await h.call('wait_jobs', { dir, names: ['tests'], timeoutMs: 10000 })).jobs[0].state, 'DONE');
    // LOST: a pid file whose process is gone and no exit code -> restarted by start_jobs.
    writeFileSync(join(dir, 'lost.pid'), '999999');
    assert.equal((await h.call('wait_jobs', { dir, names: ['lost'], timeoutMs: 1000 })).jobs[0].state, 'LOST');
    assert.equal((await h.call('start_jobs', { dir, jobs: [{ name: 'lost', cwd, command: 'echo back' }] })).jobs[0].started, true);
    // Timeout: a running job is reported RUNNING with done=false.
    await h.call('start_jobs', { dir, jobs: [{ name: 'slow', cwd, command: 'sleep 5' }] });
    const tw = await h.call('wait_jobs', { dir, names: ['slow'], timeoutMs: 1500 });
    assert.equal(tw.done, false); assert.equal(tw.jobs[0].state, 'RUNNING');
    // 1.5.9: a noisy failing job returns at most ~1500 characters of tail (long lines cut); the log keeps everything.
    await h.call('start_jobs', { dir, jobs: [{ name: 'noisy', cwd, command: 'for i in $(seq 1 60); do printf "line $i %0400d\\n" 0; done; exit 1' }] });
    const nw = await h.call('wait_jobs', { dir, names: ['noisy'], timeoutMs: 10000, tailLines: 40 });
    assert.equal(nw.jobs[0].state, 'FAILED');
    assert.ok(nw.jobs[0].tail.length <= 1501, `tail ${nw.jobs[0].tail.length}`); assert.match(nw.jobs[0].tail, /line 60/);
  } finally { h.close(); rmSync(tmp, { recursive: true, force: true }); }
});

test('a runner that dies at once (CVNXDTQY on Windows) falls back to a direct child', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mld-jobs-broken-'));
  const dir = join(tmp, 'm', '.mtm-tmp', 'jobs'); const cwd = join(tmp, 'm'); mkdirSync(cwd, { recursive: true });
  const h = new Helper({ MTM_JOB_RUNNER_BROKEN: '1' });
  try {
    const s = await h.call('start_jobs', { dir, jobs: [{ name: 'prep-install', cwd, command: 'echo installed; exit 0' }, { name: 'prep-build', cwd, command: 'sleep 1; echo built' }] });
    assert.deepEqual(s.jobs.map(j => j.mode), ['direct', 'direct'], JSON.stringify(s));
    const w = await h.call('wait_jobs', { dir, timeoutMs: 15000 });
    assert.ok(w.done);
    assert.deepEqual(w.jobs.map(j => [j.name, j.state]).sort(), [['prep-build', 'DONE'], ['prep-install', 'DONE']]);
    assert.match(w.jobs.find(j => j.name === 'prep-build').tail, /built/);
  } finally { h.close(); rmSync(tmp, { recursive: true, force: true }); }
});

test('1.5.16: heavy jobs share a machine-wide queue, first started first served; servers are not queued', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mld-queue-'));
  const dir = join(tmp, 'm', '.mtm-tmp', 'jobs'); const cwd = join(tmp, 'm'); mkdirSync(cwd, { recursive: true });
  const h = new Helper({ MTM_HEAVY_JOBS: '1', MTM_HEAVY_QUEUE_DIR: join(tmp, 'queue') });
  const { readFileSync } = await import('node:fs');
  const { heavyJob } = await import('../src/jobs.mjs');
  try {
    assert.equal(heavyJob('install-s1', 'pnpm install --frozen-lockfile'), true);
    assert.equal(heavyJob('fixed-build', 'yarn build:browser'), true);
    assert.equal(heavyJob('ui', 'node .mtm-tmp/tools/serve.mjs --mode prod --port 5101'), false);
    assert.equal(heavyJob('app', 'pnpm dev'), false);
    const mark = n => `echo ${n} >> ${join(tmp, 'order.txt')}`;
    await h.call('start_jobs', { dir, jobs: [
      { name: 'install-a', cwd, command: `${mark('a-begin')}; sleep 2; ${mark('a-end')}` },
      { name: 'install-b', cwd, command: `${mark('b-begin')}; ${mark('b-end')}` },
      { name: 'srv', cwd, command: `node serve.mjs 2>/dev/null; ${mark('srv')}` }] });
    const w = await h.call('wait_jobs', { dir, timeoutMs: 30000 });
    assert.ok(w.done, JSON.stringify(w));
    const order = readFileSync(join(tmp, 'order.txt'), 'utf8').trim().split('\n');
    assert.ok(order.indexOf('a-end') < order.indexOf('b-begin'), order.join(','));
    assert.ok(order.indexOf('srv') < order.indexOf('a-end'), `the server is not queued: ${order.join(',')}`);
  } finally { h.close(); rmSync(tmp, { recursive: true, force: true }); }
});

test('1.5.16: a game job goes before the waiting baseline; slot installs keep their order', async () => {
  const { ticketFile } = await import('../src/jobs.mjs');
  const { basename } = await import('node:path');
  const names = [ticketFile('100', 1, 'baseline'), ticketFile('200', 3, 'integration-1')].map(f => basename(f)).sort();
  assert.ok(names[0].endsWith('-3.json'), names.join(','));
});

test('1.5.17: installs run one at a time while other heavy jobs share the queue', { skip: process.platform === 'win32' && 'POSIX shell test' }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mld-install-'));
  const dir = join(tmp, 'm', '.mtm-tmp', 'jobs'); const cwd = join(tmp, 'm'); mkdirSync(cwd, { recursive: true });
  const h = new Helper({ MTM_HEAVY_JOBS: '3', MTM_HEAVY_QUEUE_DIR: join(tmp, 'queue') });
  const { readFileSync } = await import('node:fs');
  try {
    const mark = n => `echo ${n} >> ${join(tmp, 'order.txt')}`;
    await h.call('start_jobs', { dir, jobs: [
      { name: 'install-s1', cwd, command: `${mark('i1-begin')}; sleep 2; ${mark('i1-end')}` },
      { name: 'install-s2', cwd, command: `${mark('i2-begin')}; ${mark('i2-end')}` },
      { name: 'prep-build', cwd, command: `${mark('b-begin')}; sleep 1; ${mark('b-end')}` }] });
    const w = await h.call('wait_jobs', { dir, timeoutMs: 30000 });
    assert.ok(w.done, JSON.stringify(w));
    const order = readFileSync(join(tmp, 'order.txt'), 'utf8').trim().split('\n');
    assert.ok(order.indexOf('i1-end') < order.indexOf('i2-begin'), `installs one at a time: ${order.join(',')}`);
    assert.ok(order.indexOf('b-begin') < order.indexOf('i1-end'), `the build does not wait for the installs: ${order.join(',')}`);
  } finally { h.close(); rmSync(tmp, { recursive: true, force: true }); }
});
