// 1.5.26: the brief as a checklist, built only from the organizer's text (any kind of item).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklist, openBoxes } from '../src/checklist.mjs';

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
