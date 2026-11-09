// Background jobs for long commands (install, build, baseline tests, slot installs).
// UV8P4HUS: the scout spent 35 of 84 model turns polling log tails because an exec call returns after about 30 s
// whatever yield it asks for, and each poll re-sent ~41k tokens. start_jobs launches the commands detached (they
// outlive the Codex turn that started them, e.g. slot installs that continue after ENVIRONMENT_READY) and
// wait_jobs blocks inside the helper until they finish, so one model turn covers minutes of waiting.
//
// Layout per job in <dir>: <name>.cmd.txt (command), <name>.pid, <name>.log (stdout+stderr), <name>.exit (exit code,
// written when the command ends). No secrets are written: commands must read passwords from env files themselves.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/;
const isWin = process.platform === 'win32';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fail(code, message) { const e = new Error(message); e.code = code; throw e; }

function checkDir(dir) {
  if (typeof dir !== 'string' || !isAbsolute(dir)) fail('INVALID_JOB_DIR', 'dir must be an absolute path (e.g. <matchRoot>/.mtm-tmp/jobs)');
  if (!/[\\/]\.mtm-tmp([\\/]|$)/.test(dir)) fail('INVALID_JOB_DIR', 'dir must be inside a .mtm-tmp folder (git-ignored)');
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function tail(file, lines = 12) {
  if (!existsSync(file)) return '';
  const text = readFileSync(file, 'utf8');
  // At most ~1500 characters per job: the full log stays in the file (5FLQMNAA: up to 23k characters per wait_jobs).
  const out = text.slice(-6000).split(/\r?\n/).filter(l => l.trim()).slice(-lines).map(l => l.length > 300 ? `${l.slice(0, 300)}…` : l).join('\n');
  return out.length > 1500 ? `…${out.slice(-1500)}` : out;
}

export function jobState(dir, name) {
  const read = f => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').trim() : null;
  const exitText = read(`${name}.exit`);
  const pid = Number(read(`${name}.pid`));
  const exit = exitText !== null && exitText !== '' && Number.isFinite(Number(exitText)) ? Number(exitText) : null;
  const running = exit === null && alive(pid);
  const state = exit !== null ? (exit === 0 ? 'DONE' : 'FAILED') : running ? 'RUNNING' : existsSync(join(dir, `${name}.pid`)) ? 'LOST' : 'MISSING';
  return { name, state, exit, pid: Number.isFinite(pid) ? pid : null };
}

/** Shell + args for one command. The process exit code is the command's exit code; with exitFile the shell also
 *  writes it there itself (direct mode: the helper that started it may be gone by then). */
export function shellFor(command, exitFile = null, platform = process.platform) {
  if (platform !== 'win32') {
    const write = exitFile ? `; echo $c > '${exitFile.replace(/'/g, "'\\''")}'` : '';
    return ['sh', ['-c', `(${command}); c=$?${write}; exit $c`]];
  }
  const write = exitFile ? `; Set-Content -LiteralPath '${exitFile.replace(/'/g, "''")}' -Value $c` : '';
  return ['pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    `$env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')+';'+$env:Path; ` +
    `$env:PRISMA_HIDE_UPDATE_MESSAGE='1'; $env:CI='1'; ` +
    `try { & { ${command} } ; $c = if ($LASTEXITCODE) { $LASTEXITCODE } else { 0 } } catch { Write-Output $_; $c = 1 }${write}; exit $c`]];
}

/** Installs, builds and test runs share the machine-wide queue of job-runner.mjs; servers and short commands do not. */
export function heavyJob(name, command) {
  const text = `${name} ${command}`;
  if (/serve\.mjs|\b(dev|start|preview|serve|watch)\b(?![-:\w])/i.test(command)) return false;
  return /\b(install|ci|build|test|tests|vitest|jest|playwright|e2e|typecheck|tsc|baseline|lage)\b/i.test(text);
}

/** The machine-wide queue of heavy jobs (see job-runner.mjs) and a job's place in it. */
export const queueDir = () => process.env.MTM_HEAVY_QUEUE_DIR || join(tmpdir(), 'mtm-heavy-queue');
// The baseline run queues behind everything else. Slot installs do not: in SC0E8AV2 (1.5.16) they did, and the
// workers' test runs starved install-s3/s5/s6 until minute 20, so wave 2 started in slots still installing and each
// start_work took 3.5 minutes. Within a class, first started first served.
export const ticketFile = (order, pid, name = '') =>
  join(queueDir(), `${name === 'baseline' ? 2 : 1}-${String(order || Date.now()).padStart(20, '0')}-${pid}.json`);

const RUNNER = fileURLToPath(new URL('./job-runner.mjs', import.meta.url));

function launch(dir, name, cwd, mode, order = '') {
  const log = join(dir, `${name}.log`), exitFile = join(dir, `${name}.exit`);
  if (mode === 'runner') {
    // CVNXDTQY: on Windows a DETACHED pwsh (no console) exits at once with code 0 and no output. So the detached
    // process is a small Node runner (needs no console); it starts the shell normally (hidden console), waits and
    // writes the exit code. The runner outlives the helper and the Codex turn.
    const child = spawn(process.execPath, [RUNNER, dir, name, cwd, String(order)], { cwd, detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, CI: '1' } });
    child.on('error', err => { try { writeFileSync(exitFile, '127'); writeFileSync(log, `runner start failed: ${err.message}\n`, { flag: 'a' }); } catch { /* ignore */ } });
    child.unref();
    // Take the queue place now, in start order: the runner processes start at their own pace.
    try {
      const command = readFileSync(join(dir, `${name}.cmd.txt`), 'utf8');
      if (child.pid && heavyJob(name, command)) {
        mkdirSync(queueDir(), { recursive: true });
        writeFileSync(ticketFile(order, child.pid, name), JSON.stringify({ pid: child.pid, job: name, state: 'WAIT', since: Date.now() }));
      }
    } catch { /* the runner takes its place itself */ }
    return child.pid ?? null;
  }
  // Fallback: the shell as a direct, non-detached child (works everywhere, but may die with the helper).
  const command = readFileSync(join(dir, `${name}.cmd.txt`), 'utf8').replace(/\n$/, '');
  const [cmd, args] = shellFor(command, exitFile);
  const fd = openSync(log, 'a');
  const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, CI: '1' } });
  closeSync(fd);
  child.on('error', err => { try { writeFileSync(exitFile, '127'); writeFileSync(log, `start failed: ${err.message}\n`, { flag: 'a' }); } catch { /* ignore */ } });
  child.on('exit', code => { try { if (!readFileSync(exitFile, 'utf8').trim()) writeFileSync(exitFile, String(code ?? 1)); } catch { /* ignore */ } });
  child.unref();
  return child.pid ?? null;
}

/** Starts each job unless it is already RUNNING or DONE (idempotent; LOST/FAILED/MISSING jobs restart).
 *  After starting, checks for 1.5 s that no job was LOST at once; a lost one is relaunched as a direct child. */
export async function startJobs({ dir, jobs, restartFailed = false } = {}) {
  checkDir(dir);
  if (!Array.isArray(jobs) || jobs.length === 0 || jobs.length > 12) fail('INVALID_JOBS', 'jobs must be an array of 1..12 {name, cwd, command}');
  mkdirSync(dir, { recursive: true });
  const out = [];
  const batch = Date.now();
  for (const [idx, j] of jobs.entries()) {
    if (!NAME.test(j?.name ?? '')) fail('INVALID_JOBS', `invalid job name ${j?.name}`);
    if (typeof j.command !== 'string' || !j.command.trim()) fail('INVALID_JOBS', `${j.name}: command required`);
    if (typeof j.cwd !== 'string' || !isAbsolute(j.cwd) || !existsSync(j.cwd)) fail('INVALID_JOBS', `${j.name}: cwd must be an existing absolute folder`);
    const before = jobState(dir, j.name);
    if (before.state === 'RUNNING' || before.state === 'DONE' || (before.state === 'FAILED' && !restartFailed)) { out.push({ ...before, started: false }); continue; }
    writeFileSync(join(dir, `${j.name}.exit`), '');
    writeFileSync(join(dir, `${j.name}.log`), '');
    writeFileSync(join(dir, `${j.name}.cmd.txt`), j.command + '\n');
    const pid = launch(dir, j.name, j.cwd, 'runner', `${batch}${String(idx).padStart(3, '0')}`);
    writeFileSync(join(dir, `${j.name}.pid`), String(pid ?? ''));
    out.push({ name: j.name, state: 'RUNNING', pid, started: true, mode: 'runner', cwd: j.cwd });
  }
  const started = out.filter(o => o.started);
  if (started.length) {
    await sleep(1500);
    for (const o of started) {
      const st = jobState(dir, o.name);
      if (st.state !== 'LOST') { o.state = st.state; continue; }
      const pid = launch(dir, o.name, o.cwd, 'direct');
      writeFileSync(join(dir, `${o.name}.pid`), String(pid ?? ''));
      Object.assign(o, { pid, mode: 'direct', state: jobState(dir, o.name).state });
    }
  }
  return { dir, jobs: out.map(({ cwd, ...o }) => o) };
}

/** Blocks until every named job (default: all *.pid in dir) is no longer RUNNING, or timeout. Returns states + log tails. */
export async function waitJobs({ dir, names, timeoutMs = 280000, tailLines = 12 } = {}) {
  checkDir(dir);
  if (!existsSync(dir)) fail('JOB_DIR_MISSING', `${dir} does not exist`);
  const { readdirSync } = await import('node:fs');
  const list = Array.isArray(names) && names.length ? names : readdirSync(dir).filter(f => f.endsWith('.pid')).map(f => f.slice(0, -4));
  for (const n of list) if (!NAME.test(n)) fail('INVALID_JOBS', `invalid job name ${n}`);
  const limit = Math.min(Math.max(Number(timeoutMs) || 280000, 1000), 280000);
  const end = Date.now() + limit;
  let states = list.map(n => jobState(dir, n));
  while (states.some(s => s.state === 'RUNNING') && Date.now() < end) {
    await sleep(Math.min(2000, end - Date.now()));
    states = list.map(n => jobState(dir, n));
  }
  const lines = Math.min(Math.max(Number(tailLines) || 12, 0), 40);
  return {
    done: !states.some(s => s.state === 'RUNNING'),
    waitedMs: limit - Math.max(0, end - Date.now()),
    jobs: states.map(s => ({ ...s, log: join(dir, `${s.name}.log`), tail: s.state === 'DONE' ? tail(join(dir, `${s.name}.log`), Math.min(lines, 4)) : tail(join(dir, `${s.name}.log`), lines) }))
  };
}
