import { execFile } from 'node:child_process';

/** Runs git without a shell. Resolves {code, stdout, stderr}. */
export function git(cwd, args, { timeoutMs = 120000 } = {}) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function gitOk(cwd, args, opts) {
  const r = await git(cwd, args, opts);
  if (r.code !== 0) throw Object.assign(new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`), { code: 'GIT_FAILED' });
  return r.stdout;
}

/**
 * Removes an index.lock that a killed git left behind (YH6OAYMZ: a slot checkout timed out under disk load, the
 * orphaned lock then failed every later start_work in that slot). Only a lock older than maxAgeMs is removed: a
 * younger one may belong to a git that is still running.
 */
export async function clearStaleLock(cwd, maxAgeMs = 90000) {
  const { existsSync, statSync, rmSync } = await import('node:fs');
  const { isAbsolute, join } = await import('node:path');
  const r = await git(cwd, ['rev-parse', '--git-dir'], { timeoutMs: 30000 });
  if (r.code !== 0) return false;
  const dir = r.stdout.trim();
  const lock = join(isAbsolute(dir) ? dir : join(cwd, dir), 'index.lock');
  try {
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > maxAgeMs) { rmSync(lock, { force: true }); return true; }
  } catch { /* still in use */ }
  return false;
}
