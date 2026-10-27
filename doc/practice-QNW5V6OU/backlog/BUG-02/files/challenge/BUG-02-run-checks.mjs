#!/usr/bin/env node
/**
 * BUG-02 check runner. Runs `pnpm test` in the app folder (src/) and writes a
 * machine-readable log for the BUG-02 evidence folder.
 *
 * Usage (from the src/ folder that holds package.json):
 *   node BUG-02-run-checks.mjs [evidenceDir]      default: ../answers/BUG-02/evidence
 *
 * Writes <evidenceDir>/test.log as UTF-8, colours disabled. It starts with
 * `command: pnpm test` and ends with `exit_code: <n>`. Do not edit the log.
 * No dependencies; Node.js 18+.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? join("..", "answers", "BUG-02", "evidence");
mkdirSync(outDir, { recursive: true });

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const res = spawnSync("pnpm test", {
  shell: true,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.replace(ANSI, "").replace(/\r\n/g, "\n");
const code = res.status ?? 1;
writeFileSync(join(outDir, "test.log"), `command: pnpm test\n${output.trimEnd()}\nexit_code: ${code}\n`, "utf8");
console.log(`pnpm test -> exit_code ${code} (${join(outDir, "test.log")})`);
process.exitCode = code === 0 ? 0 : 1;
