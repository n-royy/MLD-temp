/**
 * BUG-02 currency report: reads, from the application database, the latest invoice of each
 * BUG-02 fixture company and writes a fixed-format report for the evidence folder.
 *
 * Copy this file to src/prisma/report-bug02.ts and run from the src/ folder after the
 * verification steps:
 *   pnpm tsx prisma/report-bug02.ts ../answers/BUG-02/evidence/bug-02-test-data.json ../answers/BUG-02/evidence/currency-report.txt
 *
 * The report is written as UTF-8 by this script. Do not edit it.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { db } from "~/server/db";

interface Fixture {
  backlogItemKey: string;
  data: { companies: Array<{ key: string; name: string; currency: string }> };
}

function loadFixture(path: string): Fixture {
  let parsed = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  if (Array.isArray(parsed?.content) && typeof parsed.content[0]?.text === "string") {
    parsed = JSON.parse(parsed.content[0].text);
  }
  if (parsed?.backlogItemKey !== "BUG-02" || !Array.isArray(parsed?.data?.companies)) {
    throw new Error("Not a BUG-02 fixture.");
  }
  return parsed as Fixture;
}

async function main() {
  const [fixturePath, outPath] = process.argv.slice(2);
  if (!fixturePath || !outPath) {
    throw new Error("Usage: pnpm tsx prisma/report-bug02.ts <bug-02-test-data.json> <currency-report.txt>");
  }
  const fixture = loadFixture(fixturePath);
  const lines = ["BUG-02 currency report"];
  for (const key of ["VND", "USD"]) {
    const spec = fixture.data.companies.find((c) => c.key === key);
    const prefix = key.toLowerCase();
    const company = spec ? await db.company.findFirst({ where: { name: spec.name } }) : null;
    lines.push(`${prefix}_company: ${company?.name ?? "missing"}`);
    const invoice = company
      ? await db.invoice.findFirst({
          where: { companyId: company.id },
          orderBy: { createdAt: "desc" },
          include: { payments: { select: { amountMinor: true } } },
        })
      : null;
    if (!invoice) {
      lines.push(`${prefix}_invoice: none`);
      continue;
    }
    const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amountMinor), 0);
    lines.push(`${prefix}_invoice_status: ${invoice.status}`);
    lines.push(`${prefix}_invoice_currency: ${invoice.currencyCode}`);
    lines.push(`${prefix}_invoice_total_minor: ${Number(invoice.totalMinor)}`);
    lines.push(`${prefix}_invoice_paid_minor: ${paid}`);
  }
  const report = lines.join("\n") + "\n";
  writeFileSync(outPath, report, "utf8");
  process.stdout.write(report);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
