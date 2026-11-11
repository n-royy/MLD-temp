# team-pack 1.5.28: reading numbers from an image

On top of 1.5.27. Driven by 45CVHIIC TASK-11 (CFO audit voucher, 48/80; every other item full, 968/1000). The
worker applied every rule of the voucher right (struck-through rows, dashed draft flow, boundary direction, baseline),
but read the four Section 1 amounts off the whole image with one zero missing each (35000000 → 3500000, -18500000 →
-1850000, -12000000 → -1200000, 19500000 → 1950000). Two of six fields were wrong (net adjustment 2400000 instead of
24000000, ACCT-VN-01 balance 215530227 instead of 236230227). Its self-check recomputed from the same transcription,
so it passed. The flows on the same image (8 digits) were read right.

## 1. WORKER.md item kind 5: values read from an image
- The whole image once for layout and rules; every number, code and mark from an enlarged crop of its region.
- Transcription with each number as the exact string seen and its digit count; re-read in groups of three.
- Magnitude cross-check: a value a digit shorter or longer than its neighbours is re-read; printed totals must match.
- Strikethroughs, colours, line styles and arrows confirmed in crops too.
- A script over the transcription checks arithmetic, not reading.
- The `view_image` limit for screenshots does not apply to such input images (whole image once, then small crops).

## 2. tools/crop-image.ps1
`skills/team-orchestrator/tools/crop-image.ps1` (installed to `<workspace>/.agents/skills/team-orchestrator/tools/`):
enlarged crop (3x, at most 2000 px) of a region in original pixels, PowerShell 7 + System.Drawing only. Without
`-Out` it prints the image size.

## 3. Checklist box "Image input"
An image path under `data/` or `challenge/` in the brief or the MVS, or an image file the organizer sends under
`challenge/`, adds a box (crops, digit counts, cross-check, marks). Like a `Spec` box it needs its own proof
(` - proof: ...`) or it is reported as `no proof`; it does not hold back an auto-submit.
