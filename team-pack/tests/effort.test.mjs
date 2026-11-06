// Effort profile from the brief alone (1.5.12: the organizer no longer marks heavy items with a title prefix).
// Briefs below are the real 32PTEO8K texts (Context/Requirements/Grading; the "[Heavy Task]" prefix removed),
// shortened where a section carries no signal, plus the Solova CR-01 sentence that once tripped a naive hint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { effortOf } from '../src/runtime-session.mjs';

const T = (key, type, points, descriptionMd) => ({ key, type, points, descriptionMd });
const BRIEFS = [
  T('TASK-08', 'TASK', 100, `# Integration test suite: money movement between accounts
## Requirements
1. Read the specification and design integration test cases for it.
2. Implement the cases under \`packages/loot-core/src/server/integration/\`.
3. Run the suite. Where a case fails because the application does not do what the specification states, change the application source.
4. Finish with the whole suite passing.
## Grading
Your suite is run against your submission, against a correct build and against builds that each break one part of the specification.`),
  T('BUG-09', 'BUG', 80, `# Schedule status on the edge of the upcoming window
## Requirements
1. Fix the schedule status rule in the application source.
2. Rebuild the app and verify it in a browser.
3. Add automated tests for the change in new files.
## Grading
The organizer builds your submitted source and replays the scenarios in a browser, and hidden tests check the status rule.`),
  T('CR-07', 'CR', 100, `# Reconciliation audit page
## Context
After statement imports, rule splits and transfers between accounts, finance audits each month's money that leaves the budget.
## Requirements
1. **Server.** Add \`packages/loot-core/src/server/budget/reconciliation-audit.ts\`.
2. **Screen.** Route \`/reconciliation-audit\`.
3. Load the official test data for \`CR-07\` from the test data store into a fresh budget.
4. Add automated tests for the change in new files.
## Grading
Hidden tests check the server audit in many more cases, and load the official test data with your submitted source.`),
  T('BUG-11', 'BUG', 100, `# Support ticket SUP-9901: a customer's books do not match the bank
## Context
A coffee roaster imports its October bank statement into its operating account. Treasury later turned one statement line into a reserve transfer and moved it to another account.
## Requirements
1. Find the causes with the Company Tools, and fix the application source.
2. Reproduce the customer's case with your fixed application. Report:
   - **closingBalances**: the balances of Mekong Operating, Mekong Treasury and Mekong Vault.
   - **splitSampleSubtransactions**: the amounts of the split parts of the bill with notes \`MCK-990104\`, in split order.
   - **newPayeesCreated**: the number of payees the import creates (transfer payees not included).
   - **vaultTransferSources**: for each transaction in Mekong Vault, in date order, the name of the account its payee names.
3. Keep public handler names, their arguments, the database schema and migrations.
4. Add automated tests for the change in new files.`),
  T('PI-02', 'PI', 90, `# Production incident: transactions land in the wrong category
## What we need from you
1. **rootCauseRelease**: the release that introduced the fault.
2. **firstBadTs**: the \`ts\` of the first log entry that applied a wrong rule.
3. **affectedTransactions**: the number of distinct transactions that received a wrong rule.
4. **mispostedMinor**: the sum of the absolute \`amountMinor\` of those transactions.`),
  T('TASK-10', 'TASK', 100, `# Multi-bank statement archive audit
## Context
Finance collected the October 2025 statement records of twelve partner banks into one archive, MONOLITH-2025-10. The same transaction can appear in an intraday feed and in the end-of-day file, some transactions were reversed at end of day, and several banks are under a settlement audit. The company's settlement and deduplication rules, and each bank's settlement profile documents, are in the knowledge base.
## Requirements
1. Find the rules in the knowledge base, and the archive's description in the test data store (\`get_test_data TASK-10\`). The archive is in the match folder at \`data/monolithic-statements-bundle.json.gz\`: one gzip-compressed JSON document whose \`records\` array holds 50,000 records.
2. Decompress the archive outside \`src/\` and do not commit the decompressed file. How you process it is up to you.
3. Report:
   - **activeBankCodes**: the bank codes whose records count under the rules.
   - **validSettledCount**: the number of records that count after deduplication.
   - **reversedVoidCount**: the number of transactions that are void because they were reversed.
   - **netSettledVolumeMinor**: the sum of the net amounts of the counted records, in minor units.
   - **accountNetBalances**: one object \`{ accountId, netBalanceMinor, txCount }\` for every account with a counted record, sorted by \`accountId\`.
4. Do not change the application source for this item.
## Grading
Each field is compared exactly with the organizers' answer and scored on its own.`),
  T('TASK-05', 'TASK', 60, `# Budget month range
## Question
1. \`monthsBeforeEarliest\`: how many months budgets exist before the earliest needed date.
2. \`minimumMonthsAhead\`: how many months the budget always reaches ahead of the current date.
3. \`monthsAfterLatestAllocation\`: how many empty months are kept after the latest allocated month.
4. \`hardCapMonthsAhead\`: the most months the budget ever reaches ahead of the current date.`),
  T('TASK-12', 'TASK', 100, `# Sync storm: which budget cells were really corrupted
## Context
On 18 October 2025 a sync storm hit the CRDT sync service. Customers reported budget cells with wrong amounts, and the sync service wrote a very large event dump that day. Most of its errors are noise: retried merges, canary dry runs, healed divergences and retried writes.
## Requirements
1. Find the current corruption rule in the knowledge base, and the dump's description in the test data store (\`get_test_data TASK-12\`). The dump is in the match folder at \`data/sync-storm-2025-10.ndjson.gz\`.
2. Decompress the dump outside \`src/\` and do not commit the decompressed file. How you read it is up to you.
3. Report:
   - **totalCompleteChains**: the number of distinct \`chainId\` values with at least one real corruption.
   - **corruptedChainIds**: those \`chainId\` values.
   - **firstCorruptedSeq**: the smallest \`seq\` of a \`budget.cell_corrupted\` entry that is a real corruption.
   - **totalCorruptedDeltaMinor**: the sum of the absolute \`corruptedDeltaMinor\` of the real corruptions, each counted once.
   - **corruptedDeltaByCategory**: the same sum per \`categoryId\`, as an object, for every category with a real corruption.
4. Do not change the application source for this item.`),
  T('PI-03', 'PI', 80, `# Production incident: scheduled transactions posted with wrong amounts
## What we need from you
1. **rootCauseRelease**: the release that introduced the fault.
2. **firstWrongPostingTs**: the \`ts\` of the log entry of the first wrong posting, in log order.
3. **affectedSchedules**: every schedule with at least one wrong posting.
4. **misPostedMinor**: the sum of the absolute difference between the posted amount and the correct amount.`),
  T('TASK-06', 'TASK', 60, `# Rule operators
## Question
1. \`numberOps\`: the condition operators allowed for number fields.
2. \`booleanOps\`: the condition operators allowed for boolean fields.
3. \`approxPercent\`: the percentage of the value used as the threshold of "is approximately" on numbers.`),
  T('TASK-07', 'TASK', 50, `# Statement pack for bank file import
## Context
The data team needs a statement pack: a large set of bank statement files in several formats, together with a manifest.
## Requirements
1. Commit the statement files and \`datasets/bulk-03/manifest.json\` in the application source root. The whole directory is at most 20 MB.
2. The manifest describes what Actual Budget does today, in the source you were given.
3. Follow \`challenge/TASK-07-pack.md\` for the manifest format, import settings and pack requirements.
## Acceptance criteria
3. The pack meets every volume, mix, overlap, recurrence, special-case and payee requirement.`),
  T('TASK-11', 'TASK', 80, `# CFO audit voucher for October 2025
## Context
It exists only as an image: \`data/cfo-audit-voucher-2025-10.png\` in the match folder. Some lines are struck through.
## Requirements
1. Read the voucher. Everything you need is on it.
2. Report:
   - **visualAuthCode**: the visual authorization code on the voucher.
   - **approvedAdjustmentIds**: the ids of the Section 1 adjustments that count.
   - **netVoucherAdjustmentMinor**: the sum of those adjustments, in minor units.
   - **settledFlowIds**: the ids of the Section 2 flows that are settled.
   - **visualBoundaryNetMinor**: the net amount of the settled flows that cross the budget boundary.
   - **postVoucherAccount01Minor**: the balance of ACCT-VN-01 that the Section 3 directive gives.
3. Do not change the application source for this item.`)
];

test('32PTEO8K without the title prefix: exactly TASK-10 and TASK-12 are heavy', () => {
  const r = Object.fromEntries(BRIEFS.map(b => [b.key, effortOf(b, BRIEFS)]));
  assert.deepEqual(Object.keys(r).filter(k => r[k].heavy).sort(), ['TASK-10', 'TASK-12']);
  assert.ok(Object.keys(r).filter(k => r[k].candidate).every(k => ['CR-07', 'BUG-11'].includes(k)));
  assert.ok(r['TASK-10'].score >= 8 && r['TASK-12'].score >= 7, JSON.stringify([r['TASK-10'], r['TASK-12']]));
  for (const k of Object.keys(r).filter(k => !r[k].heavy)) assert.ok(r[k].score <= 2, `${k}: ${JSON.stringify(r[k])}`);
  assert.ok(r['TASK-10'].reasons.some(x => /compressed data/.test(x)) && r['TASK-10'].reasons.some(x => /50,000 records/.test(x)));
});

test('a title prefix or the word "heavy" alone does not make an item heavy; present data sizes add weight', () => {
  const peers = [T('CR-01', 'CR', 140, ''), T('CR-02', 'CR', 120, ''), T('CR-03', 'CR', 100, '')];
  const solova = { ...peers[0], title: '[Heavy Task] Export CSV', descriptionMd:
    '## Requirements\n1. Include draft and void invoices.\n2. Do not introduce a heavy library when it is unnecessary.' };
  const e = effortOf(solova, peers);
  assert.equal(e.heavy, false); assert.ok(e.score <= 2, JSON.stringify(e));
  const hinted = effortOf({ ...solova, descriptionMd: 'This is a heavy task: plan your time.' }, peers);
  assert.ok(hinted.reasons.includes('organizer hint'));
  const sized = effortOf(T('TASK-01', 'TASK', 60, 'Read `data/ledger.csv` and report the totals.'), [], { 'data/ledger.csv': 2_000_000 });
  assert.equal(sized.score, 2); assert.equal(sized.level, 'M');
});

// 1.5.13: code-heavy signals. Real requirement texts of the two largest code items of 32PTEO8K.
const CR07 = T('CR-07', 'CR', 100, `# Reconciliation audit page
## Requirements
1. **Server.** Add \`packages/loot-core/src/server/budget/reconciliation-audit.ts\` exporting \`async function buildReconciliationAudit({ month })\`, and register it on the budget app as handler \`budget/reconciliation-audit\`.
2. **Screen.** Route \`/reconciliation-audit\`, reached by a sidebar link named **Reconciliation audit**. A month input with \`data-testid="reconciliation-audit-month"\`. One row per category, each with \`data-testid="reconciliation-audit-row"\`. An element with \`data-testid="reconciliation-boundary-net"\`. A button **Export Audit CSV**.
3. Load the official test data for \`CR-07\` from the test data store into a fresh budget.
4. Add automated tests for the change in new files.
## Acceptance criteria
1. The audit follows the current standard.
2. The page shows the rows and boundary net and downloads the exact CSV.
3. The evidence CSV and \`auditSummary\` are the audit of the official test data.
## Grading
TC-01 is replayed with \`CR-07-mvs.test.ts\`. Hidden tests check the server audit in many more cases, and load the official test data with your submitted source.`);
const BUG11 = T('BUG-11', 'BUG', 100, `# Support ticket SUP-9901: a customer's books do not match the bank
## Requirements
1. Find the causes with the Company Tools, and fix the application source. The customer's problems may have more than one cause.
2. Reproduce the customer's case with your fixed application.
3. Keep public handler names, their arguments, the database schema and migrations.
4. Add automated tests for the change in new files.
## Acceptance criteria
1. Statement amounts follow the import amount standard.
2. Imported payee names find existing payees as the payee matching standard says.
3. Split rules allocate as the finance allocation rule says.
4. Both sides of a transfer stay consistent when either side moves to another account.
5. The reported figures are those of a correct application for the customer's data.
## Grading
Organizer hidden tests then check many more cases, including the whole pipeline on other data.`);
const SMALL_BUG = T('BUG-09', 'BUG', 80, `# Schedule status on the edge of the upcoming window
## Requirements
1. Fix the schedule status rule in the application source.
2. Rebuild the app and verify it in a browser.
## Acceptance criteria
1. With the default window, a schedule due in exactly 7 days is Upcoming.
2. With the window set to 2 weeks, a schedule due in exactly 14 days is Upcoming.
## Grading
The organizer replays the scenarios in a browser, and hidden tests check the status rule.`);

test('code-heavy items (several parts, many touchpoints, several causes, hidden tests) become heavy candidates', () => {
  const peers = [CR07, BUG11, SMALL_BUG];
  const cr = effortOf(CR07, peers), bug = effortOf(BUG11, peers), small = effortOf(SMALL_BUG, peers);
  assert.equal(cr.level, 'L', JSON.stringify(cr)); assert.ok(cr.reasons.some(x => /parts/.test(x)) && cr.reasons.some(x => /touchpoints/.test(x)));
  assert.equal(bug.level, 'L', JSON.stringify(bug)); assert.ok(bug.reasons.includes('several causes'));
  assert.ok(small.score <= 1, JSON.stringify(small));
  const huge = effortOf({ ...CR07, descriptionMd: CR07.descriptionMd + '\n5. **Data.** Migrate \`packages/a/x.ts\`, \`packages/a/y.ts\`, \`/admin/audit\`.\nTC-01 TC-02 TC-03 TC-04 TC-05 TC-06. Several causes.' }, peers);
  assert.equal(huge.heavy, true, JSON.stringify(huge));
});
