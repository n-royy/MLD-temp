import { execFile } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Never start an automatic gc or maintenance in the middle of a game (six worktrees share the repository).
const QUIET = ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false'];

function once(cwd, args, timeoutMs) {
  return new Promise(resolve => {
    execFile('git', [...QUIET, ...args], { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
      const timedOut = Boolean(error && (error.killed || error.signal) && error.code == null);
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout),
        stderr: timedOut ? `${String(stderr)}git ${args[0]} timed out after ${Math.round(timeoutMs / 1000)} s (machine busy)` : String(stderr),
        timedOut });
    });
  });
}

/**
 * Runs git without a shell. Resolves {code, stdout, stderr}. UA9QF7DU: under load (installs, builds) `checkout` and
 * `commit` were killed by the timeout with an empty error ("git checkout failed: "), and a stale index.lock of the
 * killed process then failed the next call. So: a timeout says so, and one retry follows a timeout (twice the time)
 * or a lock held by another git process (after a short pause).
 */
export async function git(cwd, args, { timeoutMs = 120000, retry = true } = {}) {
  let r = await once(cwd, args, timeoutMs);
  if (!retry || r.code === 0) return r;
  if (r.timedOut) return once(cwd, args, timeoutMs * 2);
  for (let i = 0; i < 3 && r.code !== 0 && /\.lock'?:? File exists|index\.lock|Another git process/i.test(r.stderr); i++) {
    // A lock left by a git process killed by its timeout never goes away by itself: remove it once it is 60 s old.
    const lock = r.stderr.match(/'([^']+\.lock)'/)?.[1];
    try { if (lock && Date.now() - statSync(lock).mtimeMs > 60000) rmSync(lock); } catch { /* gone or busy */ }
    await sleep(3000);
    r = await once(cwd, args, timeoutMs);
  }
  return r;
}

export async function gitOk(cwd, args, opts) {
  const r = await git(cwd, args, opts);
  if (r.code !== 0) throw Object.assign(new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`), { code: 'GIT_FAILED' });
  return r.stdout;
}
