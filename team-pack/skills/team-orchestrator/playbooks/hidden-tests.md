# Playbook: hidden tests and official data

The brief announces hidden or organizer tests, or the official test data loaded with your submitted source. Half the
points are cases you never see, taken from the company standard.

1. **The standard first**: query it with the brief's own words (Company Tools), read the CURRENT revision completely,
   follow cross-references. Write every rule and boundary as a numbered table in `.mtm-tmp/<ID>/rules.md` before
   coding.
2. Implement exactly; keep module paths, exported names, handler names and signatures.
3. **One test of your own per rule and per boundary**, in a NEW test file: before/on/after each limit, zero, exact
   equality, rounding and ties (both signs), each currency, empty/null input, non-ASCII text, ordering. Run the
   provided MVS test (`<ID>-mvs.*`) as the MVS says. Never hard-code the examples. Test fixtures live next to the test
   (committed) or are built in it: the grader has no `.mtm-tmp`.
4. **Official data** (`qualityGate` `OFFICIAL_DATA`): load it with your own branch, including every other item's fix
   your grade needs (playbook `other-items`), and compare every reported figure with values computed independently
   from the brief and the current standard (a small script); they must agree. When the official data also needs a
   behaviour another open item fixes (a standard's rounding, a parser rule), apply that standard yourself in your
   branch rather than waiting.
5. **The grader's own run on your source** (checklist "Grader run on your source": "the grader loads the official
   data with your submitted source, posts the schedule there and audits it there"): that run is graded on its own and
   any crash in it scores 0 (39PSWT5C and 60IU23EZ CR-07: hidden-fixture `TypeError` twice, 11 points each time).
   Make it ONE committed test case in the project's own test runner (the one the existing tests and the MVS use), written from the start as the script that produces your official figures (no
   second script): a FRESH test database as the existing tests set it up, the data loaded through your own handlers,
   every step the brief names in its order (import, rules, transfer edits, posting the schedule...), then the graded
   call through its registered handler; assert the figures. It passes before DONE; it outranks screenshots.
6. **Read data the way the existing code does**: the base tables and the helpers that similar existing handlers use,
   not internal views or the loaded budget's state (spreadsheet cells, caches) unless existing handlers of the same
   kind use them - the grader's fixture database may not have them. The test of step 5 proves it.
7. A value the code computes ("which value does the source give") is RUN on the real code and data, never reasoned.
