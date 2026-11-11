// 1.5.26: the brief as a checklist. Every item, of any kind, gets <scratch>/<ID>/checklist.md at Start Work: what the
// brief asks for, every row and field of the answer template, every verification scenario with its expected result,
// every required evidence file, every sentence about how it is graded (hidden tests, replays, official data) and the
// test files the organizer provides. The worker ticks each box with its proof; the helper submits by itself only a
// DONE whose checklist has no open box. Built only from the organizer's own text: no guess, nothing item-specific.

const META = new Set(['schemaVersion', 'backlogId', 'status', 'evidenceFiles', 'testResults', 'engineeringRecord', 'incidentRecord']);
const NOT_ASKED = /^(context|background|scoring by completion order|story|overview)$/i;
const OUT_OF_SCOPE = /out of scope|not in scope|non-goals?/i;
const GRADING = /\b(grad(e|er|ed|ing)|hidden|replay|official|scor(e|ed|es|ing)|compared exactly|no ai|judg|points?\b|counts? only|scores? 0|validat)/i;
const ASKS = /\b(must|should|need|needs|required?|expected|exactly|only|never|do not|don't|then fix|fix\b|add\b|support|show|export|keep|create|copy|commit|report|record|set\b|include|list\b|use\b|run\b)/i;

// 1.5.27: a sentence of an organizer specification that binds every rule at once ("Every rule holds for any number
// of lines in one import"). R7WFBQBT TASK-08 lost 16 of 100 on exactly such a sentence: no case used more than a
// few lines, the planted batch-volume bug was neither fixed nor detected.
const GLOBAL = /\b(every rule|all (?:the )?rules|any number of|any (?:size|volume|amount of)|no matter how many|regardless of (?:the )?(?:number|size|order|count)|in (?:one|a single) (?:call|change|import|batch|request)|however many)\b/i;
const SPEC_FILE = /\.(md|txt)$/i;
const NOT_SPEC = /minimum-verification|submit|README/i;

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// 1.5.28: pictures the organizer gives as input (data/ or challenge/), not evidence the worker produces.
const INPUT_IMAGE = /\b((?:data|challenge)\/[\w./-]+\.(?:png|jpe?g|gif|webp|bmp|tiff?))\b/gi;
function inputImages(description, mvs, files) {
  const found = [...`${description}\n${mvs ?? ''}`.matchAll(INPUT_IMAGE)].map(m => m[1]);
  for (const f of Object.keys(files ?? {})) if (/^(?:data|challenge)\/.*\.(?:png|jpe?g|gif|webp|bmp|tiff?)$/i.test(f)) found.push(f);
  return [...new Set(found)];
}

/** Markdown -> [{ heading, lines[] }]; the text before the first heading is under heading ''. */
function sections(md) {
  const out = [{ heading: '', lines: [] }];
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) out.push({ heading: clean(h[1]), lines: [] });
    else out.at(-1).lines.push(line);
  }
  return out.filter(s => s.heading || s.lines.some(l => l.trim()));
}

/** List items (with their wrapped continuation lines) and paragraphs of a section. */
function blocks(lines) {
  const items = [], paras = [];
  let cur = null, para = [];
  const flushPara = () => { if (para.length) paras.push(clean(para.join(' '))); para = []; };
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (m) { flushPara(); cur = [m[1]]; items.push(cur); continue; }
    if (!raw.trim()) { cur = null; flushPara(); continue; }
    if (cur && /^\s{2,}\S/.test(raw)) { cur.push(raw); continue; }
    cur = null; para.push(raw);
  }
  flushPara();
  return { items: items.map(i => clean(i.join(' '))).filter(Boolean), paras: paras.filter(Boolean) };
}

const sentences = p => p.split(/(?<=[.!?])\s+(?=[A-Z`*(])/).map(clean).filter(s => s.length > 3);

/** Verification scenarios: "## <ID>-TC-01 - title" blocks with Expected / Required evidence. */
function scenarios(mvs) {
  const out = [];
  for (const s of sections(mvs)) {
    const id = s.heading.match(/\b([A-Z]+-\d+-TC-\d+)\b/)?.[1];
    if (!id) continue;
    const text = clean(s.lines.join(' '));
    const evidence = [...(text.match(/Required evidence:([^]*?)(?:$|(?<=\.)\s)/i)?.[1] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]);
    const expected = text.match(/Expected:\s*([^]*?)(?=\s*Required evidence:|$)/i)?.[1] ?? '';
    out.push({ id, title: clean(s.heading.replace(id, '').replace(/^[\s\-–:]+/, '')), expected: clean(expected), evidence, text });
  }
  return out;
}

function fieldType(schema, k) {
  const p = schema?.properties?.[k];
  if (!p) return null;
  return [p.type ?? (p.enum ? 'enum' : p.const !== undefined ? 'const' : null), p.description ? clean(p.description).slice(0, 160) : null].filter(Boolean).join(': ');
}

export function buildChecklist({ key, item = {}, mvs = null, template = null, schema = null, files = {} } = {}) {
  const boxes = [];
  const add = (section, text) => {
    const t = clean(text);
    if (!t || boxes.some(b => b.section === section && b.text === t)) return;
    boxes.push({ id: `C${boxes.length + 1}`, section, text: t });
  };
  const notes = [];
  const description = String(item.descriptionMd ?? item.description ?? '');

  // 1. What the brief asks for (every list item; asking sentences of the other paragraphs). Out of scope is noted.
  for (const s of sections(description)) {
    const { items, paras } = blocks(s.lines);
    if (OUT_OF_SCOPE.test(s.heading)) { for (const t of [...items, ...paras]) notes.push(`Out of scope (do not do): ${t}`); continue; }
    if (NOT_ASKED.test(s.heading)) continue;
    const where = s.heading ? `Brief: ${s.heading}` : 'Brief';
    for (const t of items) add(where, t);
    for (const p of paras) for (const t of sentences(p)) if (ASKS.test(t) && !GRADING.test(t)) add(where, t);
  }

  // 2. The answer template: every row and every field.
  const rows = Array.isArray(template?.testResults) ? template.testResults.map(r => r?.id).filter(Boolean) : [];
  const sc = scenarios(mvs);
  for (const id of rows) {
    const s = sc.find(x => x.id === id);
    add('Answer rows', `${id}${s?.title ? ` (${s.title})` : ''}: PASS on the final code, run as its scenario says${s?.expected ? `; expected: ${s.expected}` : ''}${s?.evidence?.length ? `; evidence ${s.evidence.map(e => `evidence/${e}`).join(', ')}` : ''}`);
  }
  for (const s of sc) if (!rows.includes(s.id)) add('Verification scenarios', `${s.id} ${s.title}: ${s.expected || s.text}`);
  for (const k of Object.keys(template ?? {})) {
    if (META.has(k)) continue;
    const t = fieldType(schema, k);
    add('Answer fields', `\`${k}\`${t ? ` (${t})` : ''}: filled with the computed value, exact type and format, never a placeholder`);
  }
  if (template && 'engineeringRecord' in template) add('Answer fields', '`engineeringRecord`: analysis, changes, tests, risks and AI collaboration filled truthfully');
  if (template && 'incidentRecord' in template) add('Answer fields', '`incidentRecord`: impact, timeline, root cause, containment, recovery, prevention');

  // 3. Evidence files.
  const evidence = [...new Set(sc.flatMap(s => s.evidence))];
  for (const e of evidence) add('Evidence', `evidence/${e}: exists, shows what its row expects, referenced by the row and listed in evidenceFiles`);

  // 3b. 1.5.28: an input image the answer is read from (45CVHIIC TASK-11 48/80: 8-digit amounts read with 7 digits).
  for (const img of inputImages(description, mvs, files)) {
    add('Image input', `${img}: every number, code and mark read from an enlarged crop (WORKER.md item kind 5, tools/crop-image.ps1), never from the whole image; each number transcribed with its digit count; lengths cross-checked against neighbouring values; strikethroughs, colours, line styles and arrows confirmed in crops. Proof after the box: the crop files and the digit counts`);
  }

  // 4. How it is graded (hidden tests, replays, official data): every such sentence, word for word.
  const gradingText = [description, String(mvs ?? ''), ...Object.values(schema?.properties ?? {}).map(p => p?.description ?? '')].join('\n\n');
  for (const s of sections(gradingText)) {
    const { items, paras } = blocks(s.lines);
    for (const t of [...items, ...paras.flatMap(sentences)]) {
      if (GRADING.test(t) && t.length < 400 && !boxes.some(b => b.text === clean(t))) add('How it is graded', `covered: ${t}`);
    }
  }

  // 4b. 1.5.27: the organizer's specification files (challenge/*-spec.md, *-pack.md ...): every statement is graded
  // (the organizer plants defects against them and builds a broken version per statement). Every list item and every
  // sentence becomes a box; sentences that bind all rules at once go first, with the volume/order/entry-point cases
  // they need; table rows (modules and entry points) are listed once so the global constraints cover each of them.
  for (const [name, content] of Object.entries(files ?? {})) {
    if (!SPEC_FILE.test(name) || NOT_SPEC.test(name) || typeof content !== 'string' || content.length < 200) continue;
    const base = name.split('/').pop();
    const entry = [];
    for (const s of sections(content)) {
      if (OUT_OF_SCOPE.test(s.heading)) { const o = blocks(s.lines); for (const t of [...o.items, ...o.paras]) notes.push(`Out of scope in ${base}: ${t}`); continue; }
      const table = s.lines.filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]+\|\s*$/.test(l)).slice(1).map(l => clean(l.replace(/\|/g, ' ').replace(/`/g, '')));
      entry.push(...table);
      const { items, paras } = blocks(s.lines.filter(l => !/^\s*\|/.test(l)));
      const where = `Spec ${base}${s.heading ? `: ${s.heading}` : ''}`;
      const listed = new Set(items);
      for (const t of [...items, ...paras.flatMap(sentences)]) {
        const text = t.replace(/\*\*/g, '');
        if (GLOBAL.test(text)) add(`Spec ${base}: constraints on every rule`, `${text} -> cases: every entry point with many records in one call (hundreds of lines or transactions, mixed kinds and order), every result checked; a planted defect may show only there`);
        else if (listed.has(t)) add(where, text); // a numbered or bulleted rule: always a box
        else if (/\b(is|are|has|have|holds?|keeps?|creates?|sets?|counts?|never|always|only|must|becomes?|stays?|deletes?|moves?|matches?|takes?|runs?|fills?|clears?|follows?|applies?)\b/i.test(text)) add(where, text);
      }
    }
    if (entry.length) add(`Spec ${base}: entry points`, `each constraint on every rule is covered through: ${entry.join('; ')}`);
  }

  // 5. Test files the organizer provides (run as instructed, never edited).
  for (const f of Object.keys(files ?? {})) if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(f)) add('Provided tests', `${f}: run exactly as the scenarios say (unchanged); it passes on your source`);

  add('Before DONE', 'every box above ticked with its proof; the full diff reviewed; validateCommand prints "valid":true; status set honestly');

  const md = [
    `# ${key} checklist`,
    '',
    'Built by the helper from the brief, the answer template, the verification scenarios, the schema and the',
    "organizer's specification files. Tick each box (`- [x]`) only when it is met on the final code. A `Spec` or `Image input` box",
    'needs its own proof after it (` - proof: <case title(s)>; mutant <what was broken>`); the same proof copied onto',
    'several boxes counts as open. Do not delete boxes. A box that does not apply: tick it and say why.',
    '',
    ...[...new Set(boxes.map(b => b.section))].flatMap(sec => [`## ${sec}`, ...boxes.filter(b => b.section === sec).map(b => `- [ ] ${b.id} ${b.text}`), '']),
    ...(notes.length ? ['## Notes (no box)', ...notes.map(n => `- ${n}`), ''] : [])
  ].join('\n');
  return { md, boxes, notes };
}

/**
 * Boxes that do not hold (1.5.27): open ones, and ticked ones whose proof is copied word for word onto 3 or more
 * boxes (R7WFBQBT TASK-08: one script ticked all 14 boxes with the same sentence). [{ id, section, why }].
 */
export function weakBoxes(text) {
  const out = [], ticked = [];
  let section = '';
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { section = h[1].trim(); continue; }
    const m = line.match(/^\s*- \[( |x|X)\]\s+(C\d+)\s*(.*)$/);
    if (!m) continue;
    if (m[1] === ' ') { out.push({ id: m[2], section, why: 'open' }); continue; }
    const proof = clean(m[3].split(/\s-\s*proof:/i)[1] ?? '');
    ticked.push({ id: m[2], section, proof });
  }
  const seen = new Map();
  for (const t of ticked) if (t.proof) seen.set(t.proof, (seen.get(t.proof) ?? 0) + 1);
  for (const t of ticked) {
    if (t.proof && seen.get(t.proof) >= 3) out.push({ id: t.id, section: t.section, why: 'copied proof' });
    else if (!t.proof && /^(Spec |Image input$)/.test(t.section)) out.push({ id: t.id, section: t.section, why: 'no proof' });
  }
  return out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** Open boxes left in a checklist file's text. */
export function openBoxes(text) {
  return [...String(text ?? '').matchAll(/^\s*- \[ \]\s+(C\d+)/gm)].map(m => m[1]);
}
