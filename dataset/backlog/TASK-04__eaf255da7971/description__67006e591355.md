# Trace the ledger after an invoice, a void and two payments

## Context
Before the accountant migrates Solova's ledger, she wants to be sure she understands what the application writes to the journal. Answer from the issued application source.

## Canonical scope
Start from a workspace whose chart of accounts was created by the seed and whose journal is empty. The workspace currency is USD; both clients are billed in USD. Apply only these actions through the normal Accounting screens, in this order:

1. Create invoice **A** for client Lotus Media: one line, quantity 2, unit price 150.00, tax 30.00. Issue it.
2. Record a BANK payment of 100.00 for client Lotus Media, applied to invoice A.
3. Create invoice **B** for client Han River Foods: one line, quantity 1, unit price 80.00, no tax. Issue it, then void it.
4. Record a CASH payment of 200.00 for client Lotus Media, applied to invoice A.

Assume every amount is stored correctly in minor units (cents) and that no automation or other user writes to the journal. Ignore the currency bug reported in other backlog items: it does not affect USD.

## Questions
1. **journalEntries** – how many journal entries the four actions write.
2. **journalLines** – how many journal lines they write.
3. **receivableMinor** – the balance of the Accounts Receivable account afterwards, debits minus credits, in minor units.
4. **taxesPayableMinor** – the balance of the Taxes Payable account afterwards, credits minus debits, in minor units.
5. **invoiceAStatus** – the stored status of invoice A afterwards, as the upper-case status code.

## Normalization
Every answer is a JSON string: integers as decimal digits with an optional leading `-`, no separators or units; the status as one code from DRAFT, SENT, PAID, PARTIAL, OVERDUE, VOID.

## Score
Maximum practice score: 70 points, 14 per field. Each field is compared by exact string equality; no AI judgement is used.

## Submission

Create `answers/TASK-04/`, copy `challenge/TASK-04-submit.json` to `answers/TASK-04/submit.json`, set the five fields and set `status` to `DONE`, `PARTIAL` or `BLOCKED`. The file must validate against `challenge/TASK-04-submit.schema.json`; keep exactly the template fields. Commit, push and give the commit SHA to Game Master. Do not add a gitRevision field.