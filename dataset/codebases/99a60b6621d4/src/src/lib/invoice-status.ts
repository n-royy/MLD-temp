import type { InvoiceStatus } from "@prisma/client";

/**
 * Status rule for issued invoices. Recording a payment and the overdue refresh
 * both go through here, so the Invoices list, the company Finance tab and the
 * dashboard agree on one status. DRAFT and VOID are never changed by payments.
 */
export interface InvoiceStatusInput {
  status: InvoiceStatus;
  totalMinor: number;
  /** Sum of every payment linked to the invoice. */
  paidMinor: number;
  /** Calendar date (stored at 00:00 UTC), or null when the invoice has no due date. */
  dueDate: Date | null;
  now: Date;
}

export function deriveInvoiceStatus(input: InvoiceStatusInput): InvoiceStatus {
  const { status, totalMinor, paidMinor, dueDate, now } = input;
  if (status === "VOID" || status === "DRAFT") return status;
  if (paidMinor > totalMinor && totalMinor > 0) return "PAID";
  if (paidMinor > 0) return "PARTIAL";
  if (dueDate && dueDate < now) return "OVERDUE";
  return "SENT";
}
