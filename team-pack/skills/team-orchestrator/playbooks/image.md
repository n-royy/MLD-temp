# Playbook: values read from an image

The transcription IS the work (45CVHIIC TASK-11: four 8-digit amounts read with 7 digits, 48/80; the self-check
recomputed from the same wrong transcription).
1. Look at the whole image once (`view_image`, detail `original`) for its layout, sections and printed rules only.
2. Read every number, code and mark from an ENLARGED CROP of its region:
   `pwsh -NoProfile -File <workspace>/.agents/skills/team-orchestrator/tools/crop-image.ps1 -Image <img>` prints the
   size; add `-Out <slotMatchRoot>/.mtm-tmp/<ID>/c1.png -X -Y -Width -Height` (original pixels, 3x enlarged) and
   `view_image` the crop. One crop per table column or label group.
3. Transcribe into `.mtm-tmp/<ID>/transcription.json`, each number as the exact string and its digit count
   (`{"text": "+35000000", "digits": 8}`); re-read in groups of three digits from the right (missing or doubled
   zeros are the usual misread).
4. Cross-check magnitudes: a value a digit shorter or longer than its neighbours is re-read in a tighter crop; a
   printed total must equal your sum of the rows. Strikethroughs, stamps, colours, line styles and arrows: confirmed
   in a crop each.
5. The `Image input` box needs the crop files and the digit counts as proof. Then apply the rules (playbook
   `data-values`).
