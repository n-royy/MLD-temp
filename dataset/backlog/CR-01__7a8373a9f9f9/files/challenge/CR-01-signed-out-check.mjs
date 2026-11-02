#!/usr/bin/env node
/**
 * CR-01 signed-out check. Sends one GET request without any cookie or credential to the
 * data source your export uses (your export endpoint, or the invoice list query it reads),
 * and writes a fixed-format verdict.
 *
 * Usage:
 *   node CR-01-signed-out-check.mjs <url> <report.txt>
 *   e.g. node CR-01-signed-out-check.mjs "http://localhost:3000/api/trpc/accounting.invoices" tc-04-signed-out-request.txt
 *
 * Verdict rules:
 *   - status REJECTED  when the response is 401 or 403, or a redirect whose Location contains /login
 *   - status ACCESSIBLE otherwise
 *   - invoice_data_leaked yes when the body contains a CR-01 fixture invoice number (CR01-) or company name
 * The report is written as UTF-8 by this script. No dependencies; Node.js 18+.
 */
import { writeFileSync } from "node:fs";

const SEEDED_MARKERS = ["CR01-", "Alpha Design", "Beta Labs", "Gamma Studio", "Ánh Dương"];

const [, , url, outPath] = process.argv;
if (!url || !outPath) {
  console.error("Usage: node CR-01-signed-out-check.mjs <url> <report.txt>");
  process.exit(2);
}

let res;
try {
  res = await fetch(url, { method: "GET", redirect: "manual", credentials: "omit" });
} catch (err) {
  console.error(`Request failed: ${err.message}`);
  process.exit(1);
}
const body = await res.text();
const location = res.headers.get("location") ?? "";
const rejected =
  res.status === 401 ||
  res.status === 403 ||
  (res.status >= 300 && res.status < 400 && location.includes("/login"));
const leaked = SEEDED_MARKERS.some((m) => body.includes(m));

const report = [
  "CR-01 signed-out check",
  "cookies_sent: none",
  `status: ${rejected ? "REJECTED" : "ACCESSIBLE"}`,
  `invoice_data_leaked: ${leaked ? "yes" : "no"}`,
].join("\n") + "\n";

writeFileSync(outPath, report, "utf8");
process.stdout.write(report);
// Raw details go to stderr only, so they never change the evidence file.
console.error(`[debug] ${url} -> HTTP ${res.status}${location ? ` Location: ${location}` : ""}`);
