# Product incident: clients receive payment reminders for invoices they already paid

## Context
Support escalated this to engineering at 10:05 UTC today (2026-10-27): since this morning, clients complain that Solova e-mailed them a payment reminder for an invoice they had already paid in full. Some clients received two reminders. The accounting team fears the problem is larger than the tickets show and that clients lose trust in our invoices.

The reminder service, the status cache and the deploy pipeline run in Solova's production platform, not in the application source you received. Everything you need is in the company's production observability logs and internal knowledge base.

## What we need from you
Investigate and report, exactly as the facts appear in our systems:

1. **rootCauseRelease** – the release that introduced the fault.
2. **rootCauseComponent** – the component whose change caused it.
3. **containmentFlag** – the feature flag on-call must switch off to stop it.
4. **affectedInvoices** – every invoice that received a reminder after it was already paid in full, not only the ones customers complained about.
5. **firstWrongfulReminderRequestId** – the request id of the earliest wrongful reminder.

Follow the company's incident report rules for names and scope. Maximum practice score: 160 points. This item has a deadline of 15 minutes from its release: after that, Game Master closes the item and accepts no submission for it.

## Scoring by completion order
The Grader scores each of the five fields on its own. Teams are then ranked by the time Game Master receives their PI-01 submission, and the official points are a share of the points the Grader gave that team:

| Completion order | Official points |
|---|---|
| 1st team | 100% of its Grader points |
| 2nd team | 90% of its Grader points |
| 3rd team | 75% of its Grader points |
| Every later team | 60% of its Grader points |

A fast but incomplete report keeps only its share of what is correct, and each team submits once.

## Out of scope
Changing the application source, re-sending e-mails, or contacting clients.

## Submission

Create `answers/PI-01/`, copy `challenge/PI-01-submit.json` to `answers/PI-01/submit.json` and fill in the five fields and the incident record. Commit and push, then give the commit SHA to Game Master. Do not add a gitRevision field.

### submit.json contract

`submit.json` must validate against `challenge/PI-01-submit.schema.json` (JSON Schema 2020-12).

- Strings exactly as logged: no added prefixes, quotes, spaces or explanations.
- `affectedInvoices` is a JSON array of invoice numbers as stored; order does not matter; the set must be complete and contain nothing else.
- Each field is compared exactly and scored on its own; no AI judgement is used.
- `incidentRecord` (impact, timeline, root cause, containment, recovery, prevention) documents your investigation; it is reviewed but does not change points.
- Set the top-level `status` to `DONE`, `PARTIAL` or `BLOCKED` before submitting.