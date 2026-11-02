// Replays the organizer's <ID>-mvs.test.ts on a worker's slot before integration, the way the grader does
// ("each case scores only when you report it PASS with evidence and the replay passes"). T5QSM1E2/CVNXDTQY showed
// that a worker's own report is not enough; this check is code, not a prompt rule.
//
// Stage 1: a minimal vitest config (alias ~ -> src, no global setup), enough for the pure-function MVS files
// ("Neither uses a database"). Stage 2, only when stage 1 cannot even load the file: the project's own config with a
// temporary copy under tests/ (global setup, database), removed afterwards.
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROW = /\b([A-Z]+-\d+-TC-\d+)\b/;

function run(cmd, args, cwd, timeoutMs) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' } },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, timedOut: Boolean(error?.killed), out: `${stdout}\n${stderr}` }));
  });
}

/** App folder of a match root: the first of <root>/src, <root> that has vitest installed. */
export function findApp(matchRoot) {
  for (const dir of [join(matchRoot, 'src'), matchRoot]) {
    const bin = join(dir, 'node_modules', 'vitest', 'vitest.mjs');
    if (existsSync(join(dir, 'package.json')) && existsSync(bin)) return { dir, bin };
  }
  return null;
}

function parse(reportFile) {
  if (!existsSync(reportFile)) return null;
  let j; try { j = JSON.parse(readFileSync(reportFile, 'utf8')); } catch { return null; }
  const tests = []; let loadError = null;
  for (const f of j.testResults ?? []) {
    if ((f.assertionResults ?? []).length === 0 && f.status === 'failed') loadError = String(f.message ?? 'suite failed to load').slice(0, 400);
    for (const a of f.assertionResults ?? []) {
      const full = [...(a.ancestorTitles ?? []), a.title].join(' > ');
      tests.push({ name: full.slice(0, 200), row: (full.match(ROW) ?? [])[1] ?? null, passed: a.status === 'passed',
        failure: a.status === 'passed' ? null : String((a.failureMessages ?? [])[0] ?? a.status).split('\n')[0].slice(0, 300) });
    }
  }
  return { tests, loadError };
}

/**
 * @param {{key:string, matchRoot:string, mvsFile:string, scratch:string, timeoutMs?:number}} o
 * @returns {Promise<{status:'PASSED'|'FAILED'|'ERROR'|'SKIPPED', rows:Record<string,{passed:number,failed:number}>, failing:Array, detail?:string, stage?:number}>}
 */
export async function replayMvs({ key, matchRoot, mvsFile, scratch, timeoutMs = 150000 }) {
  if (!mvsFile || !existsSync(mvsFile)) return { status: 'SKIPPED', rows: {}, failing: [], detail: 'no organizer MVS test file for this item' };
  const app = findApp(matchRoot);
  if (!app) return { status: 'ERROR', rows: {}, failing: [], detail: 'vitest is not installed in the slot (src/node_modules/vitest)' };
  const work = join(scratch, 'mvs'); mkdirSync(work, { recursive: true });
  const id = key.toLowerCase();
  const fwd = p => p.split('\\').join('/');

  // Stage 1: minimal config.
  const testCopy = join(work, `${id}-mvs.test.ts`);
  copyFileSync(mvsFile, testCopy);
  const cfg = join(work, 'vitest.mvs.config.mjs');
  writeFileSync(cfg, `export default { root: ${JSON.stringify(fwd(app.dir))}, resolve: { alias: { "~": ${JSON.stringify(fwd(join(app.dir, 'src')))} } }, ` +
    `test: { include: [${JSON.stringify(fwd(testCopy))}], globalSetup: [], setupFiles: [] } };\n`);
  const report1 = join(work, `${id}-report1.json`); rmSync(report1, { force: true });
  const r1 = await run(process.execPath, [app.bin, 'run', '--config', cfg, '--reporter=json', `--outputFile=${report1}`], app.dir, timeoutMs);
  let res = parse(report1); let stage = 1;

  // Stage 2: the project's own config, only when the minimal run could not load the file.
  if (!res || res.loadError || res.tests.length === 0) {
    const tmpTest = join(app.dir, 'tests', `mtm-mvs-${id}.test.ts`);
    const report2 = join(work, `${id}-report2.json`); rmSync(report2, { force: true });
    try {
      mkdirSync(join(app.dir, 'tests'), { recursive: true });
      copyFileSync(mvsFile, tmpTest);
      await run(process.execPath, [app.bin, 'run', fwd(join('tests', `mtm-mvs-${id}.test.ts`)), '--reporter=json', `--outputFile=${report2}`], app.dir, timeoutMs);
    } finally { rmSync(tmpTest, { force: true }); }
    const res2 = parse(report2);
    if (res2 && (res2.tests.length > 0 || !res)) { res = res2; stage = 2; }
  }
  if (!res) return { status: 'ERROR', rows: {}, failing: [], detail: `vitest produced no report${r1.timedOut ? ' (timed out)' : ''}: ${r1.out.trim().split('\n').slice(-3).join(' | ').slice(0, 300)}` };
  if (res.tests.length === 0) return { status: 'ERROR', rows: {}, failing: [], stage, detail: `the MVS file did not load: ${res.loadError ?? 'no tests ran'}` };
  const rows = {};
  for (const t of res.tests) {
    const k = t.row ?? '(no row id)';
    rows[k] ??= { passed: 0, failed: 0 };
    rows[k][t.passed ? 'passed' : 'failed']++;
  }
  const failing = res.tests.filter(t => !t.passed).map(({ name, row, failure }) => ({ name, row, failure }));
  return { status: failing.length ? 'FAILED' : 'PASSED', rows, failing: failing.slice(0, 10), stage };
}

/** Compares the replay with the answer's rows: PASS rows whose replay fails, and non-PASS rows whose replay passes. */
export function compareRows(answer, replay) {
  const claimedPass = [], greenNotPass = [];
  for (const r of answer?.testResults ?? []) {
    const m = replay.rows[r.id];
    if (!m) continue;
    if (r.result === 'PASS' && m.failed > 0) claimedPass.push(r.id);
    if (r.result !== 'PASS' && m.failed === 0 && m.passed > 0) greenNotPass.push(r.id);
  }
  return { claimedPass, greenNotPass };
}
