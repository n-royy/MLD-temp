// 1.5.26: the brief as a checklist, built only from the organizer's text (any kind of item).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklist, openBoxes, weakBoxes } from '../src/checklist.mjs';

const MVS = `# X-01 minimum verification scenarios

The scenarios are also provided as \`X-01-mvs.test.ts\`. Grading replays this same file against your submitted source.

## X-01-TC-01 - totals

Expected: total 42 and 3 rows.

Required evidence: \`mvs-tests.log\`.

## X-01-TC-02 - the page

Open the page. Expected: one row per category.

Required evidence: \`page.png\`, \`page.csv\`.
`;

test('rows, fields, evidence, grading sentences, provided tests and out of scope are all in the checklist', () => {
  const r = buildChecklist({
    key: 'X-01',
    item: { descriptionMd: '# X\n\n## Context\nFinance wants totals.\n\n## Acceptance criteria\n- The page lists every category.\n- Export works.\n\nThe status must follow the current standard. Hidden tests use the official data.\n\n## Out of scope\nOther months.' },
    mvs: MVS,
    template: { schemaVersion: 1, backlogId: 'X-01', status: 'NOT_STARTED', evidenceFiles: [], totalMinor: null,
      testResults: [{ id: 'X-01-TC-01', result: 'NOT_RUN', evidence: [] }, { id: 'X-01-TC-02', result: 'NOT_RUN', evidence: [] }], engineeringRecord: {} },
    schema: { properties: { totalMinor: { type: 'integer', description: 'The total in minor units.' } } },
    files: { 'challenge/X-01-mvs.test.ts': '//', 'challenge/X-01-submit.json': '{}' }
  });
  const text = r.md;
  for (const s of ['The page lists every category.', 'Export works.', 'The status must follow the current standard.',
    'X-01-TC-01 (totals): PASS', 'expected: total 42 and 3 rows.', 'X-01-TC-02 (the page)', '`totalMinor` (integer: The total in minor units.)',
    'evidence/mvs-tests.log', 'evidence/page.png', 'evidence/page.csv', 'covered: Hidden tests use the official data.',
    'covered: Grading replays this same file against your submitted source.', 'challenge/X-01-mvs.test.ts: run exactly',
    'Out of scope (do not do): Other months.']) assert.ok(text.includes(s), s);
  assert.ok(!text.includes('Finance wants totals'), 'context is not a requirement');
  assert.ok(!/- \[ \] C\d+ .*challenge\/X-01-submit\.json/.test(text), 'only test files are run');
  const open = openBoxes(text);
  assert.equal(open.length, r.boxes.length);
  assert.deepEqual(openBoxes(text.replace(/- \[ \]/g, '- [x]')), []);
});

test('an item with nothing but a description still gets its asks and the final box', () => {
  const r = buildChecklist({ key: 'BUG-01', item: { descriptionMd: 'The sidebar overlaps the content. Fix it so the content is fully visible.' } });
  assert.ok(r.md.includes('Fix it so the content is fully visible.'));
  assert.ok(r.md.includes('every box above ticked with its proof'));
});

// 1.5.27: R7WFBQBT TASK-08 lost 16 of 100 on the spec's opening sentence (batch-volume): the spec file is now taken
// apart too, constraints on every rule first, and bulk ticking with one sentence counts as open.
const SPEC = `# Money movement specification

This specification covers server behavior in \`packages/loot-core\`. Amounts are integer cents, negative for outflow.
Every rule holds for any number of lines in one import and any number of transactions in one change.

## Modules and entry points

| Module | Where | Entry points |
|---|---|---|
| Transactions | \`src/server/transactions/index.ts\` | \`batchUpdateTransactions({ added, updated, deleted })\` |
| Statement import | \`src/server/accounts/sync.ts\` | \`reconcileTransactions(accountId, lines)\`, handler \`transactions-import\` |

## T. Transfers

- **T1.** A transaction whose payee is another account's transfer payee is a transfer. It has exactly one
  counterpart in that account.
- **T3.** Changing the date of one side does not change the other.

## Out of scope

Bank sync and reports.
`;

test('1.5.27: the organizer specification becomes Spec boxes; constraints on every rule come with volume cases', () => {
  const r = buildChecklist({ key: 'TASK-08', item: { descriptionMd: '## Requirements\n1. Read the specification.' },
    template: { schemaVersion: 1, backlogId: 'TASK-08', status: 'NOT_STARTED', evidenceFiles: [], cases: [] },
    files: { 'challenge/TASK-08-spec.md': SPEC, 'challenge/TASK-08-submit.json': '{}' } });
  const spec = r.boxes.filter(b => b.section.startsWith('Spec '));
  const global = spec.filter(b => /constraints on every rule/.test(b.section));
  assert.equal(global.length, 1, JSON.stringify(global));
  assert.match(global[0].text, /^Every rule holds for any number of lines in one import/);
  assert.match(global[0].text, /over 1,000/);
  assert.ok(spec.some(b => /T1\. A transaction whose payee is another account's transfer payee is a transfer/.test(b.text) && /T\. Transfers/.test(b.section)));
  assert.ok(spec.some(b => /T3\. Changing the date of one side does not change the other/.test(b.text)));
  const entry = spec.find(b => /entry points/.test(b.section));
  assert.ok(entry && /reconcileTransactions/.test(entry.text) && /batchUpdateTransactions/.test(entry.text), JSON.stringify(entry));
  assert.ok(r.notes.some(n => /Out of scope in TASK-08-spec\.md: Bank sync/.test(n)));
  assert.ok(!r.boxes.some(b => /\*\*/.test(b.text)), 'markdown bold removed');
});

test('1.5.27: weakBoxes reports open boxes, Spec boxes without proof and proofs copied onto 3+ boxes', () => {
  const same = ' - proof: 62 cases pass; 28 mutants detected.';
  const md = ['# X checklist', '', '## Brief: Requirements', `- [x] C1 Read it.${same}`, `- [x] C2 Implement.${same}`, '- [x] C3 Run.',
    '', '## Spec x-spec.md: T. Transfers', `- [x] C4 T1 one counterpart.${same}`, '- [x] C5 T3 date stays.',
    '- [x] C6 T4 delete. - proof: T4 deleting either side; mutant skip counterpart delete', '- [ ] C7 Every rule holds for any number.'].join('\n');
  const w = weakBoxes(md);
  assert.deepEqual(w.map(b => [b.id, b.why]), [['C1', 'copied proof'], ['C2', 'copied proof'], ['C4', 'copied proof'], ['C5', 'no proof'], ['C7', 'open']]);
  assert.deepEqual(openBoxes(md), ['C7']);
});

test('1.5.28: an input image in data/ or challenge/ gets an Image input box; evidence screenshots do not', () => {
  const r = buildChecklist({
    key: 'TASK-11',
    item: { descriptionMd: '# Voucher\n\n## Context\nIt exists only as an image: `data/cfo-audit-voucher-2025-10.png` in the match folder.\n\n## Requirements\n1. Read the voucher.\n2. Take a screenshot `evidence/after.png`.' },
    template: { schemaVersion: 1, backlogId: 'TASK-11', status: 'NOT_STARTED', evidenceFiles: [], netVoucherAdjustmentMinor: null },
    files: { 'challenge/TASK-11-chart.jpg': '', 'challenge/TASK-11-submit.json': '{}' }
  });
  const images = r.boxes.filter(b => b.section === 'Image input').map(b => b.text.split(':')[0]);
  assert.deepEqual(images, ['data/cfo-audit-voucher-2025-10.png', 'challenge/TASK-11-chart.jpg']);
  assert.ok(r.md.includes('enlarged crop') && r.md.includes('digit count'));
  const ticked = r.md.replace(/- \[ \] (C\d+) (data\/cfo[^\n]*)/, '- [x] $1 $2');
  const w = weakBoxes(ticked).filter(b => b.section === 'Image input');
  assert.deepEqual(w.map(b => b.why), ['no proof', 'open'], 'the box text itself is no proof');
  const proved = ticked.replace(/(- \[x\] C\d+ data\/cfo[^\n]*)/, '$1 - proof: c1.png c2.png; 8,8,8,8,8,8 digits');
  assert.deepEqual(weakBoxes(proved).filter(b => b.section === 'Image input').map(b => b.why), ['open']);
});

test('1.5.29: files the Requirements ask to produce become Output files boxes (inputs, answers and source excluded)', () => {
  const r = buildChecklist({ key: 'TASK-07', item: { descriptionMd: `# Pack
## Requirements
1. Commit the statement files and \`datasets/bulk-03/manifest.json\` in the application source root.
2. Follow \`challenge/TASK-07-pack.md\` for the manifest format. Read \`data/input.csv\`.
3. Add \`packages/loot-core/src/server/budget/month-close.ts\` exporting a handler.
4. Export \`reports/summary.csv\` with the totals.` } });
  assert.deepEqual(r.boxes.filter(b => b.section === 'Output files').map(b => b.text.split('`')[1]), ['datasets/bulk-03/manifest.json', 'reports/summary.csv']);
});
