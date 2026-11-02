/**
 * CR-01 test data loader: loads your team's official CR-01 fixture into the application database.
 *
 * 1. Get the CR-01 fixture from the QA test data store and save it, unchanged, as
 *    answers/CR-01/evidence/cr-01-test-data.json (answers/ sits next to src/)
 *    (the object { fixtureId, backlogItemKey, description, data }; the raw MCP tool result with a
 *    `content[0].text` JSON string is accepted too).
 * 2. Copy this file to src/prisma/seed-cr01.ts and run from the src/ folder:
 *      pnpm tsx prisma/seed-cr01.ts ../answers/CR-01/evidence/cr-01-test-data.json
 *
 * It deletes every invoice and every invoice-linked payment, recreates the fixture companies and
 * invoices with the given numbers, dates, currencies, payments and states, and is safe to re-run.
 * Journal rows are never deleted (the ledger is append-only). Run it right before capturing CR-01
 * evidence and do not create invoices afterwards.
 */
import { readFileSync } from "node:fs";

import { db } from "~/server/db";
import { ensureDefaultChartOfAccounts } from "~/server/services/accounting/chart-of-accounts";
import {
  postInvoiceIssued,
  postPaymentReceived,
  refreshInvoiceStatus,
  reverseJournalEntry,
} from "~/server/services/accounting/posting";

interface FixtureCompany {
  key: string;
  name: string;
  currency: string;
}
interface FixtureInvoice {
  number: string;
  company: string;
  issueDate: string;
  dueDate: string | null;
  totalMinor: number;
  state: "DRAFT" | "ISSUED" | "VOID" | "OVERDUE";
  payments: Array<{ amountMinor: number; paidAt: string }>;
}
interface Fixture {
  fixtureId: string;
  backlogItemKey: string;
  data: { companies: FixtureCompany[]; invoices: FixtureInvoice[] };
}

function loadFixture(path: string): Fixture {
  let parsed = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  if (Array.isArray(parsed?.content) && typeof parsed.content[0]?.text === "string") {
    parsed = JSON.parse(parsed.content[0].text);
  }
  if (parsed?.backlogItemKey !== "CR-01" || !parsed?.data?.invoices || !parsed?.data?.companies) {
    throw new Error("Not a CR-01 fixture: expected { fixtureId, backlogItemKey: 'CR-01', data }.");
  }
  if (JSON.stringify(parsed).includes("{{")) {
    throw new Error("Fixture still contains {{placeholders}}: save the tool result, not a template.");
  }
  return parsed as Fixture;
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: pnpm tsx prisma/seed-cr01.ts <cr-01-test-data.json>");
  const fixture = loadFixture(path);
  const { companies, invoices } = fixture.data;

  await ensureDefaultChartOfAccounts(db);

  // 1. Clear invoices and invoice-linked payments (journal stays intact).
  await db.payment.deleteMany({ where: { invoiceId: { not: null } } });
  await db.invoice.deleteMany({});

  // 2. Recreate the fixture companies.
  await db.company.deleteMany({ where: { name: { in: companies.map((c) => c.name) } } });
  const companyByKey = new Map<string, string>();
  for (const c of companies) {
    const created = await db.company.create({
      data: { name: c.name, billingModel: "PER_PROJECT", currencyCode: c.currency },
    });
    companyByKey.set(c.key, created.id);
  }
  const currencyByKey = new Map(companies.map((c) => [c.key, c.currency]));

  // 3. Invoices.
  for (const spec of invoices) {
    const companyId = companyByKey.get(spec.company);
    if (!companyId) throw new Error(`Unknown company key ${spec.company} on ${spec.number}`);
    await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          companyId,
          invoiceNumber: spec.number,
          issueDate: day(spec.issueDate),
          dueDate: spec.dueDate ? day(spec.dueDate) : null,
          status: "DRAFT",
          subtotalMinor: spec.totalMinor,
          taxMinor: 0,
          totalMinor: spec.totalMinor,
          currencyCode: currencyByKey.get(spec.company)!,
          lines: {
            create: [
              {
                description: `QA fixture line ${spec.number}`,
                quantity: 1,
                unitPriceMinor: spec.totalMinor,
                amountMinor: spec.totalMinor,
                sourceType: "MANUAL",
              },
            ],
          },
        },
      });
      if (spec.state === "DRAFT") return;

      const issued = await postInvoiceIssued(tx, {
        id: invoice.id,
        companyId,
        totalMinor: spec.totalMinor,
        issueDate: invoice.issueDate,
        invoiceNumber: spec.number,
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } });

      if (spec.state === "VOID") {
        await reverseJournalEntry(tx, issued.id, `Void invoice ${spec.number}`);
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
        return;
      }
      if (spec.state === "OVERDUE") {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "OVERDUE" } });
        return;
      }

      for (const [i, p] of spec.payments.entries()) {
        const payment = await tx.payment.create({
          data: {
            companyId,
            invoiceId: invoice.id,
            amountMinor: p.amountMinor,
            paidAt: day(p.paidAt),
            method: "BANK",
            reference: `QA-${spec.number}-${i + 1}`,
          },
        });
        await postPaymentReceived(tx, {
          id: payment.id,
          companyId,
          amountMinor: p.amountMinor,
          paidAt: payment.paidAt,
          method: payment.method,
        });
      }
      if (spec.payments.length > 0) await refreshInvoiceStatus(tx, invoice.id);
    });
  }

  const rows = await db.invoice.findMany({
    orderBy: { issueDate: "desc" },
    select: { invoiceNumber: true, status: true, currencyCode: true },
  });
  console.log(`CR-01 fixture ${fixture.fixtureId} loaded:`);
  for (const r of rows) console.log(`  ${r.invoiceNumber} ${r.currencyCode} ${r.status}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
