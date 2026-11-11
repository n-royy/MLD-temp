# Playbook: UI evidence (rows proven in a browser or by screenshots)

A `NOT_RUN` row scores 0 even with correct code (T5QSM1E2: 3/4 and 4/5 rows lost to a covered tab and a sign-in
script that never finished; 39PSWT5C CR-07: three browser rows NOT_RUN at a 15-minute deadline, 21 points).

1. **Start the build/serve in your first minutes**, as a background job (`start_jobs`, then `.mtm-tmp/tools/serve.mjs`
   when it is done), with the commands of `env-require/README.md` or `repo-map.md`; it is ready when the code is.
   Rebuild after each source change.
2. **Check the evidence path first**: open each screen a row needs once (`shot.mjs` or one browser step) and confirm
   the controls you must operate are reachable. A covered control, redirect loop, endless sign-in or blank page is
   found now, while the code is still open.
3. **Subject steps vs foundation steps.** Subject steps (the behaviour the item fixes or adds) are done for real
   through the UI the MVS names: never create the data under test by API, database or script when the MVS says to
   enter it on a screen; never edit, crop or compose a screenshot. Foundation steps (sign in, open a page, load the
   organizer's data) may take a lawful shorter path that does not change what the row proves: the saved session of
   `shot.mjs` (`storageState: '.mtm-tmp/tools/auth.json'`), opening by URL, the keyboard instead of a covered click,
   a larger desktop viewport within the MVS size rule. Wait for a visible element, not `networkidle`. No shortcut
   when the item is about that step itself (sign-in, sessions, permissions, navigation, layout, a signed-out row).
   Never `click({ force: true })`, dispatched DOM events, injected CSS/JS, or a running app patched outside your
   commit. Every shorter path goes into that row's `note`.
4. **Screenshots**: `.mtm-tmp/tools/shot.mjs` (signed in, waits for content, one call per shot); your own browser
   script only if it cannot do the step, fixed at most twice, then another foundation path. A failed shot: read
   which wait failed (`goto` = server/route/session down; never settles = pass `--wait <visible text>`; content
   missing = product behaviour, the only reason to change code). A change not visible in the dev server: restart it
   once; still not: verify on a production build, look for the cause in the source, never in bundler output.
5. **Another item blocks your screen** (a layout bug it owns): do everything else first, then reach the screen by a
   foundation path on your own revision; the blocker may stay visible if the row's content is readable. When told
   the blocker landed, rebase, restart the server, retake only the rows still missing.
6. **Organizer scripts are the grading instruments** (`<ID>-layout-check.mjs`, `-run-checks.mjs`, `-seed.ts`,
   `-report.ts`): run them exactly as the MVS says (arguments, output names, dev and production), never replace or
   edit them. "Before fixing" evidence is taken BEFORE you change code.
7. **Do not give up a row while time remains**: a UI row stays NOT_RUN only when every lawful foundation path failed
   or less than 3 minutes remain; each failed path in the row's `note` and in DONE.json `doubts`.
