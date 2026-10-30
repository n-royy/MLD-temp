#!/usr/bin/env node
/**
 * CR-03 check runner. Runs `pnpm test` and `pnpm typecheck` in the app folder (src/) and writes
 * machine-readable logs for the CR-03 evidence folder.
 *
 * Usage (from the src/ folder that holds package.json):
 *   node CR-03-run-checks.mjs [evidenceDir]      default: ../answers/CR-03/evidence
 *
 * Writes <evidenceDir>/test.log and <evidenceDir>/typecheck.log as UTF-8, colours disabled.
 * Each log starts with `command: ...` and ends with `exit_code: <n>`.
 * Do not edit the logs. No dependencies; Node.js 18+.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? join("..", "answers", "CR-03", "evidence");
mkdirSync(outDir, { recursive: true });

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;

function run(script, file) {
  const res = spawnSync(`pnpm ${script}`, {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.replace(ANSI, "").replace(/\r\n/g, "\n");
  const code = res.status ?? 1;
  const log = `command: pnpm ${script}\n${output.trimEnd()}\nexit_code: ${code}\n`;
  writeFileSync(join(outDir, file), log, "utf8");
  console.log(`pnpm ${script} -> exit_code ${code} (${join(outDir, file)})`);
  return code;
}

const testCode = run("test", "test.log");
const typecheckCode = run("typecheck", "typecheck.log");
process.exitCode = testCode || typecheckCode ? 1 : 0;
