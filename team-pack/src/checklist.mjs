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

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

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

  // 4. How it is graded (hidden tests, replays, official data): every such sentence, word for word.
  const gradingText = [description, String(mvs ?? ''), ...Object.values(schema?.properties ?? {}).map(p => p?.description ?? '')].join('\n\n');
  for (const s of sections(gradingText)) {
    const { items, paras } = blocks(s.lines);
    for (const t of [...items, ...paras.flatMap(sentences)]) {
      if (GRADING.test(t) && t.length < 400 && !boxes.some(b => b.text === clean(t))) add('How it is graded', `covered: ${t}`);
    }
  }

  // 5. Test files the organizer provides (run as instructed, never edited).
  for (const f of Object.keys(files ?? {})) if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(f)) add('Provided tests', `${f}: run exactly as the scenarios say (unchanged); it passes on your source`);

  add('Before DONE', 'every box above ticked with its proof; the full diff reviewed; validateCommand prints "valid":true; status set honestly');

  const md = [
    `# ${key} checklist`,
    '',
    'Built by the helper from the brief, the answer template, the verification scenarios and the schema.',
    'Tick each box (`- [x]`) only when it is met on the final code, and add the proof after it (` - proof: <file, test,',
    'command or value>`). Do not delete boxes. A box that does not apply: tick it and say why. The helper submits by',
    'itself only a DONE whose checklist has no open box; anything open goes to the orchestrator.',
    '',
    ...[...new Set(boxes.map(b => b.section))].flatMap(sec => [`## ${sec}`, ...boxes.filter(b => b.section === sec).map(b => `- [ ] ${b.id} ${b.text}`), '']),
    ...(notes.length ? ['## Notes (no box)', ...notes.map(n => `- ${n}`), ''] : [])
  ].join('\n');
  return { md, boxes, notes };
}

/** Open boxes left in a checklist file's text. */
export function openBoxes(text) {
  return [...String(text ?? '').matchAll(/^\s*- \[ \]\s+(C\d+)/gm)].map(m => m[1]);
}
