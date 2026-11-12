# team-pack 1.5.34: new brief format, PIs to full marks

8COFCHVS (face-off, a new application and a new brief format): MLD 742, 5th of 6. The PIs alone lost about 150
points:

| PI | Got | Lost to |
|---|---|---|
| PI-23 (fix) | 69/75, 3rd (-17) | `heavy-line` volume version not detected by our suite |
| PI-24 (fix) | 56/70, 4th (-22) | `many-lines`, `large-amounts` versions not detected |
| PI-21 (investigation) | 56/70, 3rd (-14) | answer from an incomplete log collection (32/35 lines, 186/205 units) - our repro script was right on the grader's second data set |
| PI-22 (investigation, 8 min) | 0/65 | no committed answer before the deadline |

Root cause for the suites: the brief said "How it is judged ... several versions that each break the rules in one
place" and the classifier knew only "## Grading ... builds that each break one part": no `SUITE_DETECTION`, no
`suite-spec` playbook, no volume cases - in PIs, CRs and BUGs alike (~80 points over 7 items).

## Classifier (all items)
- Judging headings: Grading, How it is judged/graded/scored, Scoring, Judging, Evaluation, Assessment.
- Detection wording: "versions that each break", "break the rules", "each break", "fail on each" (plus the old ones);
  `SUITE_DETECTION` for any item type. "Not part of this", "not included", "excluded" are out of scope.
- Playbook `suite-spec` covers any item judged that way; the sizes the brief states ("a few hundred lines, a few
  thousand units", large amounts, long text, deep nesting, many locations) are gone past by 10x, one case each.

## PIs
- `piKind` in the PI result: `fix` (a fix judged by scenarios and our own suite - worked like an item with its
  playbooks) or `investigation` (figures from the logs). The PI message carries `piKind`, `playbooks` and `repro`.
- Repro script: when the brief asks for `answers/<ID>/repro.mjs`, the solver IS that file from the start
  (`--input --output --src`); the helper writes the grader's input shape to `<incident>/repro-input/`
  (`logs.json` = `{ "entries": [...] }`, `data.json` = the item's test data via the test-data tool).
- Every log service is paged in full (named ones first); completeness counts all of them.
- `answer_item` for a PI with more than 3 minutes left refuses `INCIDENT_DATA_PENDING` (collection running),
  `INCIDENT_DATA_INCOMPLETE` (until the agent pages the rest and marks `completedByAgent`) and `REPRO_MISSING`.
- INCIDENT.md: checkpoint - as soon as the script gives every figure, write and commit a valid PARTIAL answer (the
  helper's rescue submits it 2.5 minutes before the deadline).

## Tests
- `lane.test`: the new judging wording gives SUITE_DETECTION and `suite-spec`; the PI answer gate (pending,
  incomplete, repro missing, allowed under 3 minutes).
- `incident.test`: `repro-input/logs.json` and `data.json`, `piKind`, `playbooks`; mock test-data tool.
