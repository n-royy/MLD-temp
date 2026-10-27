#!/usr/bin/env node
/**
 * TASK-02 check runner. Runs, in the app folder (src/), the verification commands in the
 * order the task requires and writes one machine-readable log per command:
 *   pnpm install --frozen-lockfile        -> install.log
 *   pnpm audit --prod --audit-level=high  -> audit.log
 *   pnpm typecheck                        -> typecheck.log
 *   pnpm test                             -> test.log
 *
 * Usage (from the src/ folder that holds package.json):
 *   node TASK-02-run-checks.mjs [evidenceDir]      default: ../answers/TASK-02/evidence
 *
 * Each log is UTF-8 without colours, starts with `command: ...` and ends with `exit_code: <n>`.
 * Do not edit the logs. No dependencies; Node.js 18+.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? join("..", "answers", "TASK-02", "evidence");
mkdirSync(outDir, { recursive: true });

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;

function run(command, file) {
  const res = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.replace(ANSI, "").replace(/\r\n/g, "\n");
  const code = res.status ?? 1;
  writeFileSync(join(outDir, file), `command: ${command}\n${output.trimEnd()}\nexit_code: ${code}\n`, "utf8");
  console.log(`${command} -> exit_code ${code} (${join(outDir, file)})`);
  return code;
}

const codes = [
  run("pnpm install --frozen-lockfile", "install.log"),
  run("pnpm audit --prod --audit-level=high", "audit.log"),
  run("pnpm typecheck", "typecheck.log"),
  run("pnpm test", "test.log"),
];
process.exitCode = codes.some((code) => code !== 0) ? 1 : 0;
