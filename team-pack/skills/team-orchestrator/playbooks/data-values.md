# Playbook: values, data packs and investigations (answers compared exactly)

1. **Decide what is asked.** "Which value does the source / the code compute" -> RUN the issued code on the official
   data (a script calling the real function, or the real flow on the test database). "What is the correct value"
   under a company standard -> compute it from the CURRENT standard with a small script, then run the code too; if
   they differ the standard wins (the code may hold a defect another item fixes): say so in the engineering record.
2. Every value by script over ALL the data, never by eye: complete sets (page every capped search until `returned`
   summed equals `total`), earliest by the order the brief names, exact strings as stored, normalization applied
   literally. The script asserts its own coverage.
3. Write the answer with `answer_item` (`values`, `record`, `evidence` = your script output): it fills the
   template, validates, commits and writes DONE.json in one call. Write the computed fields as soon as the script
   gives them (a rescue submits what is committed).
4. **Data pack or manifest (`qualityGate` DATA_REQUIREMENTS)**: the manifest and every file the Requirements name
   exist from the first commit (skeleton, then completed; 39PSWT5C TASK-07: files without the manifest, 0/45).
   Requirement table: every quantity, ratio, mix, overlap, recurrence, special case and size limit, the value
   reached and the margin; stay clearly inside bounds. Replay as the grader does, on the issued source
   (`issuedRevision`: `git checkout <issuedRevision> -- <changed product files>`, replay, `git checkout HEAD --
   <files>`), through the import path and settings the specification names; every manifest number equals the replay.
5. Items without rows: DONE.json `tests` = `{"required":0,"executed":1,"passed":1,...}` for the one verification.
