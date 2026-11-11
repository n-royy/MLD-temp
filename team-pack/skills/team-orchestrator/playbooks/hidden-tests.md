# Playbook: hidden tests and official data

The brief announces hidden or organizer tests, or the official test data loaded with your submitted source. Half the
points are cases you never see, taken from the company standard.

1. **The standard first**: query it with the brief's own words (Company Tools), read the CURRENT revision completely,
   follow cross-references. Write every rule and boundary as a numbered table in `.mtm-tmp/<ID>/rules.md` before
   coding.
2. Implement exactly; keep module paths, exported names, handler names and signatures.
3. **One test of your own per rule and per boundary**, in a NEW test file: before/on/after each limit, zero, exact
   equality, rounding and ties (both signs), each currency, empty/null input, non-ASCII text, ordering. Run the
   provided `<ID>-mvs.test.ts` as the MVS says. Never hard-code the examples. Test fixtures live next to the test
   (committed) or are built in it: the grader has no `.mtm-tmp`.
4. **Official data** (`qualityGate` `OFFICIAL_DATA`): load it with your own branch, including every other item's fix
   your grade needs (playbook `other-items`), and compare every reported figure with values computed independently
   from the brief and the current standard (a small script); they must agree. When the official data also needs a
   behaviour another open item fixes (a standard's rounding, a parser rule), apply that standard yourself in your
   branch rather than waiting.
5. A value the code computes ("which value does the source give") is RUN on the real code and data, never reasoned.
