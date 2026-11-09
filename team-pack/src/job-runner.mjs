#!/usr/bin/env node
// Detached runner for one background job (see jobs.mjs): node job-runner.mjs <dir> <name> <cwd>.
// Runs <dir>/<name>.cmd.txt in the platform shell as a normal (non-detached, hidden-console) child, appends its
// output to <name>.log and writes its exit code to <name>.exit. On Windows it falls back to powershell.exe when
// pwsh cannot be started.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { heavyJob, installJob, queueDir, shellFor, ticketFile } from './jobs.mjs';

// Test hook: simulate the Windows failure seen in CVNXDTQY (detached process dies at once, writes nothing).
if (process.env.MTM_JOB_RUNNER_BROKEN === '1') process.exit(0);

const [dir, name, cwd, order] = process.argv.slice(2);
const log = join(dir, `${name}.log`), exitFile = join(dir, `${name}.exit`);
const command = readFileSync(join(dir, `${name}.cmd.txt`), 'utf8').replace(/\n$/, '');

// Machine-wide queue for heavy jobs (1.5.16). UA9QF7DU: six slot installs, two 1 GB production builds, the baseline
// suite and test runs at once on one disk: every test run took ~4 minutes, git calls timed out, a PI waited 20 minutes.
// Installs, builds and full test runs of every slot and helper queue here, at most MTM_HEAVY_JOBS (3) at once, first
// started first served (start_jobs passes its call order). Servers and short commands are not queued.
const QUEUE = queueDir();
const LIMIT = Math.max(1, Number(process.env.MTM_HEAVY_JOBS) || 3);
const INSTALL_LIMIT = Math.max(1, Number(process.env.MTM_INSTALL_JOBS) || 1);
const STUCK_MS = 20 * 60000; // a job running longer than this no longer holds its place
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
let ticket = null;

async function queueTurn() {
  mkdirSync(QUEUE, { recursive: true });
  ticket = ticketFile(order, process.pid, name); // usually written already by start_jobs, in start order
  const install = installJob(name, command);
  writeFileSync(ticket, JSON.stringify({ pid: process.pid, job: name, install, state: 'WAIT', since: Date.now() }));
  let said = 0;
  for (;;) {
    const ahead = [];
    let installsAhead = 0;
    for (const f of readdirSync(QUEUE).sort()) {
      const file = join(QUEUE, f);
      if (file === ticket) break;
      let t = null;
      try { t = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
      if (!alive(t.pid)) { try { rmSync(file); } catch { /* another runner removed it */ } continue; }
      if (t.state === 'RUN' && Date.now() - t.since > STUCK_MS) continue;
      ahead.push(t.job);
      if (t.install) installsAhead++;
    }
    if (ahead.length < LIMIT && (!install || installsAhead < INSTALL_LIMIT)) break;
    if (Date.now() - said > 60000) {
      said = Date.now();
      writeFileSync(log, `[mtm] queued behind ${ahead.length} heavy job(s) on this machine: ${ahead.slice(0, 6).join(', ')}\n`, { flag: 'a' });
    }
    await sleep(2000);
  }
  writeFileSync(ticket, JSON.stringify({ pid: process.pid, job: name, install, state: 'RUN', since: Date.now() }));
}
const leave = () => { if (ticket) { try { rmSync(ticket); } catch { /* ignore */ } ticket = null; } };

function run(cmd, args, allowFallback) {
  const fd = openSync(log, 'a');
  const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, CI: '1' } });
  closeSync(fd);
  child.on('error', err => {
    if (allowFallback && process.platform === 'win32' && err.code === 'ENOENT') return run('powershell.exe', args, false);
    writeFileSync(log, `start failed: ${err.message}\n`, { flag: 'a' });
    writeFileSync(exitFile, '127');
    leave();
  });
  child.on('exit', code => { leave(); writeFileSync(exitFile, String(code ?? 1)); });
}

if (heavyJob(name, command)) await queueTurn();
const [cmd, args] = shellFor(command);
run(cmd, args, true);
