#!/usr/bin/env node
// Detached runner for one background job (see jobs.mjs): node job-runner.mjs <dir> <name> <cwd>.
// Runs <dir>/<name>.cmd.txt in the platform shell as a normal (non-detached, hidden-console) child, appends its
// output to <name>.log and writes its exit code to <name>.exit. On Windows it falls back to powershell.exe when
// pwsh cannot be started.
import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shellFor } from './jobs.mjs';

// Test hook: simulate the Windows failure seen in CVNXDTQY (detached process dies at once, writes nothing).
if (process.env.MTM_JOB_RUNNER_BROKEN === '1') process.exit(0);

const [dir, name, cwd] = process.argv.slice(2);
const log = join(dir, `${name}.log`), exitFile = join(dir, `${name}.exit`);
const command = readFileSync(join(dir, `${name}.cmd.txt`), 'utf8').replace(/\n$/, '');

function run(cmd, args, allowFallback) {
  const fd = openSync(log, 'a');
  const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, CI: '1' } });
  closeSync(fd);
  child.on('error', err => {
    if (allowFallback && process.platform === 'win32' && err.code === 'ENOENT') return run('powershell.exe', args, false);
    writeFileSync(log, `start failed: ${err.message}\n`, { flag: 'a' });
    writeFileSync(exitFile, '127');
  });
  child.on('exit', code => writeFileSync(exitFile, String(code ?? 1)));
}

const [cmd, args] = shellFor(command);
run(cmd, args, true);
