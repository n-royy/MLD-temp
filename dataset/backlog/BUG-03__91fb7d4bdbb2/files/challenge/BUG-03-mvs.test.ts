// BUG-03 Minimum Verification Scenarios as executable tests. Published to teams as
// challenge/BUG-03-mvs.test.ts; the grader replays this same file against the submitted source.
// Copy it to src/tests/bug-03-mvs.test.ts and run: pnpm vitest run tests/bug-03-mvs.test.ts
import { describe, expect, it } from "vitest";

import { deriveInvoiceStatus } from "~/lib/invoice-status";

type Input = Parameters<typeof deriveInvoiceStatus>[0];
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("BUG-03-TC-01", () => {
  it("two payments that add up exactly to the total make the invoice PAID", () => {
    expect(deriveInvoiceStatus({ status: "PARTIAL", totalMinor: 30000, paidMinor: 18000 + 12000, dueDate: day("2026-12-01"), now: new Date("2026-11-05T09:00:00Z") } as Input)).toBe("PAID");
  });
  it("an overpaid invoice is PAID", () => {
    expect(deriveInvoiceStatus({ status: "SENT", totalMinor: 30000, paidMinor: 30500, dueDate: day("2026-12-01"), now: new Date("2026-11-05T09:00:00Z") } as Input)).toBe("PAID");
  });
});

describe("BUG-03-TC-02", () => {
  it("an unpaid invoice is still SENT late on its due date", () => {
    expect(deriveInvoiceStatus({ status: "SENT", totalMinor: 30000, paidMinor: 0, dueDate: day("2026-11-05"), now: new Date("2026-11-05T21:00:00Z") } as Input)).toBe("SENT");
  });
  it("the same invoice is OVERDUE the next day", () => {
    expect(deriveInvoiceStatus({ status: "SENT", totalMinor: 30000, paidMinor: 0, dueDate: day("2026-11-05"), now: new Date("2026-11-06T00:30:00Z") } as Input)).toBe("OVERDUE");
  });
});

describe("BUG-03-TC-03", () => {
  it("a partially paid invoice stays PARTIAL after its due date", () => {
    expect(deriveInvoiceStatus({ status: "PARTIAL", totalMinor: 30000, paidMinor: 12000, dueDate: day("2026-10-01"), now: new Date("2026-11-05T09:00:00Z") } as Input)).toBe("PARTIAL");
  });
  it("a draft invoice is never changed", () => {
    expect(deriveInvoiceStatus({ status: "DRAFT", totalMinor: 30000, paidMinor: 30000, dueDate: null, now: new Date("2026-11-05T09:00:00Z") } as Input)).toBe("DRAFT");
  });
  it("together with the fix: a single payment of the exact total is PAID", () => {
    expect(deriveInvoiceStatus({ status: "SENT", totalMinor: 12500, paidMinor: 12500, dueDate: null, now: new Date("2026-11-05T09:00:00Z") } as Input)).toBe("PAID");
  });
});
