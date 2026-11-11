# Playbook: heavy items (brief `heavy: true`)

Expensive by the organizer's own effort profile; one at a time, done by the slot's own worker; time is the limit.
1. **Plan first** (`.mtm-tmp/<ID>/plan.md`): every row (what it proves, how it is verified, cost), the files to change,
   shared code, risks, the order (shared code first, then rows from cheapest to most expensive).
2. **Progress notes** (`.mtm-tmp/<ID>/progress.md`): one or two lines after every step; after a context compaction
   re-read plan.md and progress.md instead of exploring again.
3. **Row by row**: after each PASS, that row and its evidence into the answer (others NOT_RUN, status PARTIAL),
   validate, commit: the committed answer is always submittable.
4. Large data (archives, 50,000 records): stream it with a script outside `src/`, never into your context; never
   commit decompressed data.
5. Self-review against every acceptance criterion and row, sync with the branch (core step 5), final checks, DONE.
