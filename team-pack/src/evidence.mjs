// Required evidence from the organizer's minimum-verification-scenarios.md, checked in code (1.6.1).
// T5QSM1E2: BUG-02 and CR-01 had correct code but rows NOT_RUN because the screenshots / downloaded CSV files the MVS
// names were never produced; CR-01 was submitted with ~14 minutes of match time left.
//
// MVS shapes seen in real matches:
//   ## BUG-02-TC-01 – VND invoice ... Required evidence: `tc-01-vnd-invoice.png`, `currency-report.txt`.
//   ## BUG-01-TC-03 ... Required evidence (screenshot): tc-03-mobile-dashboard.png and tc-03-mobile-accounting.png
//   ## CR-01-TC-01 – all companies ... Required evidence:\n- `tc-01-all-invoices.png`: ...\n- `tc-01-all-invoices.csv`: ...
//   ## General evidence (required once)  | `before-invoices.png` | ... |
const FILE = /(?<![\w./-])([A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|csv|txt|json|log|md|html|pdf|xlsx))(?![\w-])/g;

function sections(md) {
  const out = []; let cur = null;
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) { cur = { title: h[1].trim(), lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out;
}

/** { rows: { "<ID>-TC-nn": [files] }, general: [files] } */
export function requiredEvidence(md) {
  const rows = {}; const general = [];
  for (const s of sections(md)) {
    const id = (s.title.match(/\b([A-Z]+-\d+-TC-\d+)\b/) ?? [])[1];
    const text = s.lines.join('\n');
    if (id) {
      const at = text.search(/required evidence/i);
      if (at < 0) continue;
      const files = [...new Set([...text.slice(at).matchAll(FILE)].map(m => m[1]))];
      if (files.length) rows[id] = files;
    } else if (/general evidence|required once/i.test(s.title)) {
      // Only the first table column / list item names (the content column may mention other files).
      for (const line of s.lines) {
        const cell = line.match(/^\s*\|([^|]+)\|/) ?? line.match(/^\s*[-*]\s+`([^`]+)`/);
        if (!cell) continue;
        for (const m of cell[1].matchAll(FILE)) if (!general.includes(m[1])) general.push(m[1]);
      }
    }
  }
  return { rows, general };
}

/**
 * Compares an answer with the required evidence. exists(name) says whether answers/<ID>/evidence/<name> exists.
 * passMissing: PASS rows that do not reference, or lack on disk, a file the MVS requires for them.
 * open: rows not PASS, with the files still missing for them. generalMissing: required-once files missing on disk.
 */
export function evidenceGaps(answer, req, exists) {
  const passMissing = [], open = [];
  for (const r of answer?.testResults ?? []) {
    const need = req.rows[r.id] ?? [];
    const refs = new Set((r.evidence ?? []).map(e => String(e).replace(/^evidence\//, '')));
    const missing = need.filter(f => !refs.has(f) || !exists(f));
    if (r.result === 'PASS') { if (missing.length) passMissing.push({ row: r.id, missing }); }
    else open.push({ row: r.id, result: r.result, missing: need.filter(f => !exists(f)) });
  }
  const generalMissing = req.general.filter(f => !exists(f));
  return { passMissing, open, generalMissing };
}
