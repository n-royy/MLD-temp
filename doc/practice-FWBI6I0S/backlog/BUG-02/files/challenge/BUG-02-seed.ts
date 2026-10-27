/**
 * BUG-02 test data loader: creates your team's two BUG-02 client companies.
 *
 * 1. Get the BUG-02 fixture from the QA test data store and save it, unchanged, as
 *    answers/BUG-02/evidence/bug-02-test-data.json (answers/ sits next to src/)
 *    (the object { fixtureId, backlogItemKey, description, data }; the raw MCP tool result with a
 *    `content[0].text` JSON string is accepted too).
 * 2. Copy this file to src/prisma/seed-bug02.ts and run from the src/ folder:
 *      pnpm tsx prisma/seed-bug02.ts ../answers/BUG-02/evidence/bug-02-test-data.json
 *
 * It deletes the fixture companies if they exist (with their invoices and payments) and
 * creates them again with the fixture currencies. Nothing else is touched. Safe to re-run.
 */
import { readFileSync } from "node:fs";

import { db } from "~/server/db";

interface Fixture {
  fixtureId: string;
  backlogItemKey: string;
  data: { companies: Array<{ key: string; name: string; currency: string }> };
}

export function loadBug02Fixture(path: string): Fixture {
  let parsed = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  if (Array.isArray(parsed?.content) && typeof parsed.content[0]?.text === "string") {
    parsed = JSON.parse(parsed.content[0].text);
  }
  if (parsed?.backlogItemKey !== "BUG-02" || !Array.isArray(parsed?.data?.companies)) {
    throw new Error("Not a BUG-02 fixture: expected { fixtureId, backlogItemKey: 'BUG-02', data }.");
  }
  if (JSON.stringify(parsed).includes("{{")) {
    throw new Error("Fixture still contains {{placeholders}}: save the tool result, not a template.");
  }
  return parsed as Fixture;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: pnpm tsx prisma/seed-bug02.ts <bug-02-test-data.json>");
  const fixture = loadBug02Fixture(path);
  const { companies } = fixture.data;

  await db.company.deleteMany({ where: { name: { in: companies.map((c) => c.name) } } });
  for (const c of companies) {
    await db.company.create({
      data: { name: c.name, billingModel: "PER_PROJECT", currencyCode: c.currency },
    });
  }
  console.log(`BUG-02 fixture ${fixture.fixtureId} loaded:`);
  for (const c of companies) console.log(`  ${c.name} (${c.currency})`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
