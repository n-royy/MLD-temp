# Read the heatmap's logged time for one day

## Context
A client disputes the activity shown on the Dashboard contribution heatmap for Wednesday 2026-10-14. Before the call, the account manager needs to know exactly which "logged time" value the heatmap tooltip shows for that day, as computed by the issued source.

## Canonical scope
Use the issued application source and the official QA test data issued to your team for TASK-03: it contains the time entries exactly as stored in the `time_entries` table and the workspace settings that were active. Assume no other time entries exist. Follow the Dashboard heatmap's own calculation in the source, not a billing rule.

## Question
Which value does the heatmap report as logged time (`timeUnits`) for the calendar day 2026-10-14?

## Normalization
The answer is one unsigned decimal integer string, without whitespace, separators, units or prose. Do not return a JSON number.

## Deadline and score
This item has a deadline of 8 minutes from its release: after that, Game Master closes the item and accepts no submission for it. Maximum practice score: 50 points. The answer is compared by exact string equality.

## Submission

Create `answers/TASK-03/`, copy `challenge/TASK-03-submit.json` to `answers/TASK-03/submit.json`, set `timeUnits` and set `status` to `DONE`, `PARTIAL` or `BLOCKED`. The file must validate against `challenge/TASK-03-submit.schema.json`; keep exactly the template fields. Commit, push and give the commit SHA to Game Master. Do not add a gitRevision field.