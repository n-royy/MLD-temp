// Incident fast path (PI items), done in code by the helper, not by the model.
// P2XQMD8T: MLD's PI-01 was 100 % correct but second (-16 points): the orchestrator was integrating BUG-03 when PI-01
// appeared, then a worker was spawned and spent ~15 model turns on start_work, reading instructions, listing tools and
// paging search_logs one call at a time. Collecting every log page and the incident rules is mechanical, so the helper
// does it the moment the PI is discovered and hands the orchestrator one folder of complete data.
//
// Adaptive to the Company Tools as listed at run time (names, parameters, paging); nothing match-specific is assumed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OFFSET_KEYS = ['offset', 'skip', 'start', 'cursor', 'pageToken', 'after', 'page'];
const LIMIT_KEYS = ['limit', 'pageSize', 'size', 'maxResults', 'count'];
const ENTRY_KEYS = ['entries', 'logs', 'items', 'results', 'records', 'events', 'data'];
const TOTAL_KEYS = ['total', 'totalCount', 'count', 'totalEntries'];
// Only used when a log search needs a filter: service names come from the logs, the brief and the KB text;
// these generic names are a last resort.
const GENERIC_SERVICES = ['web', 'api', 'app', 'auth', 'worker', 'db', 'gateway', 'deploy'];
const ENTITY = /^[A-Z][A-Z0-9]{1,9}(?:-[A-Z0-9]{1,12}){1,4}$/;      // record ids such as ABC-XYZ-1234
// Context keys that mark a change event (deploy, release, version, feature flags).
const CHANGE_KEYS = ['release', 'version', 'build', 'deployment', 'deploy', 'components', 'changes', 'flags'];

// Document ids such as ABC-DEF-01 named in a brief.
const DOC_ID = /\b[A-Z]{2,6}-[A-Z]{2,6}-[0-9]{1,4}\b/g;
const props = def => def?.inputSchema?.properties ?? {};
const required = def => def?.inputSchema?.required ?? [];

/** The log-search and knowledge-base tools of the current Company Tools list. */
export function pickTools(defs = []) {
  const byName = re => defs.find(d => re.test(d.name ?? '')) ?? null;
  const logTool = byName(/^search_logs$/i) ?? byName(/log/i);
  const kbTool = byName(/^kb_search$/i) ?? byName(/kb|knowledge|wiki|standard/i);
  const p = props(logTool);
  const offsetKey = OFFSET_KEYS.find(k => k in p) ?? null;
  const limitKey = LIMIT_KEYS.find(k => k in p) ?? null;
  const limitMax = limitKey ? Number(p[limitKey]?.maximum) || null : null;
  return { logTool, kbTool, offsetKey, limitKey, limitMax,
    serviceKey: ['service', 'services', 'component', 'source'].find(k => k in p) ?? null,
    queryKey: ['query', 'q', 'text', 'search'].find(k => k in p) ?? null,
    kbQueryKey: ['query', 'q', 'text', 'search'].find(k => k in props(kbTool)) ?? null,
    kbLimitKey: LIMIT_KEYS.find(k => k in props(kbTool)) ?? null, kbLimitMax: Number(props(kbTool)?.limit?.maximum) || null };
}

function parse(text) {
  const t = String(text ?? '').trim();
  try { return JSON.parse(t); } catch { /* maybe a prefix */ }
  const i = t.indexOf('{');
  if (i >= 0) { try { return JSON.parse(t.slice(i)); } catch { /* not JSON */ } }
  return null;
}

function entriesOf(j) {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== 'object') return null;
  for (const k of ENTRY_KEYS) if (Array.isArray(j[k])) return j[k];
  return null;
}
const totalOf = j => { for (const k of TOTAL_KEYS) if (j && Number.isFinite(j[k])) return j[k]; return null; };
const nextCursorOf = j => j?.nextCursor ?? j?.next ?? j?.cursor ?? j?.nextPageToken ?? null;
const sig = e => JSON.stringify(e);
const tsOf = e => String(e?.ts ?? e?.timestamp ?? e?.time ?? e?.at ?? '');

/**
 * Pages one log query to the end. Stops when the total is reached, a page adds nothing new, or the budget ends.
 * @returns {{args:object, total:number|null, returned:number, complete:boolean, error?:string}}
 */
async function pageAll(call, t, baseArgs, seen, budget) {
  const limit = t.limitKey ? (t.limitMax ?? 20) : null;
  const out = { args: baseArgs, total: null, returned: 0, complete: false };
  let offset = t.offsetKey === 'page' ? 1 : 0, cursor = null;
  for (let page = 0; page < 60; page++) {
    if (budget.calls <= 0 || Date.now() > budget.until) { out.error = 'budget exhausted'; return out; }
    const args = { ...baseArgs };
    if (limit) args[t.limitKey] = limit;
    if (t.offsetKey && page > 0) {
      if (['cursor', 'pageToken', 'after'].includes(t.offsetKey)) { if (!cursor) break; args[t.offsetKey] = cursor; }
      else args[t.offsetKey] = offset;
    } else if (t.offsetKey === 'page') args.page = offset;
    budget.calls--;
    let r;
    try { r = await call(t.logTool.name, args); } catch (e) { out.error = `${e.code ?? 'ERROR'} ${String(e.message ?? '').slice(0, 160)}`; return out; }
    if (r?.isError) { out.error = String(r.text ?? '').slice(0, 200); return out; }
    const j = parse(r?.text);
    const list = entriesOf(j);
    if (!list) { out.error = `unrecognised answer: ${String(r?.text ?? '').slice(0, 160)}`; return out; }
    out.total ??= totalOf(j);
    let added = 0;
    for (const e of list) { const s = sig(e); if (!seen.has(s)) { seen.set(s, e); added++; } }
    out.returned += list.length;
    cursor = nextCursorOf(j);
    offset = t.offsetKey === 'page' ? offset + 1 : offset + list.length;
    if (out.total !== null && out.returned >= out.total) { out.complete = true; return out; }
    if (list.length === 0 || added === 0 || !t.offsetKey) {
      // Without a total, an empty or repeated page (or a tool without paging) means the end; with one, it is a gap.
      out.complete = out.total === null;
      if (!out.complete) out.error = `paging stopped at ${out.returned} of ${out.total}`;
      return out;
    }
  }
  return out;
}

function compact(e) {
  const c = e?.context && typeof e.context === 'object' ? e.context : {};
  return { ts: tsOf(e), service: e?.service ?? null, level: e?.level ?? null, requestId: e?.requestId ?? null, message: e?.message ?? null, context: c };
}

/** Facts any incident needs, without interpreting them: releases, flags, entity timelines, per-service summaries. */
export function digestOf(entries, articles, coverage, brief = {}) {
  const logs = entries.map(compact).sort((a, b) => a.ts.localeCompare(b.ts));
  const services = new Map();
  const releases = new Map();
  const flags = new Map();
  const entities = new Map();
  for (const e of logs) {
    const s = services.get(e.service) ?? { count: 0, first: e.ts, last: e.ts, messages: new Map(), levels: new Map() };
    s.count++; s.last = e.ts; s.messages.set(e.message, (s.messages.get(e.message) ?? 0) + 1); s.levels.set(e.level, (s.levels.get(e.level) ?? 0) + 1);
    services.set(e.service, s);
    if (CHANGE_KEYS.some(k => k in e.context)) {
      const id = String(e.context.release ?? e.context.version ?? e.context.build ?? e.context.deployment ?? e.requestId ?? e.ts);
      const r = releases.get(id) ?? { release: id, events: [] };
      r.events.push({ ts: e.ts, service: e.service, message: e.message, components: e.context.components, changes: e.context.changes, flags: e.context.flags });
      releases.set(id, r);
    }
    const fl = e.context.flags && typeof e.context.flags === 'object' ? e.context.flags : null;
    for (const [k, v] of Object.entries(fl ?? {})) { const f = flags.get(k) ?? []; f.push({ ts: e.ts, value: v, service: e.service, requestId: e.requestId }); flags.set(k, f); }
    for (const k of ['flag', 'featureFlag', 'flagKey']) if (typeof e.context[k] === 'string') { const f = flags.get(e.context[k]) ?? []; f.push({ ts: e.ts, value: e.context.value ?? e.context.enabled ?? null, service: e.service, requestId: e.requestId }); flags.set(e.context[k], f); }
    const ids = new Set();
    for (const v of Object.values(e.context)) if (typeof v === 'string' && ENTITY.test(v)) ids.add(v);
    for (const id of ids) {
      const list = entities.get(id) ?? [];
      list.push({ ts: e.ts, service: e.service, level: e.level, requestId: e.requestId, message: e.message, context: e.context });
      entities.set(id, list);
    }
  }
  const lines = [];
  lines.push(`# Incident data for ${brief.key ?? 'PI'} (collected by the helper, complete unless marked)`, '');
  lines.push('## Coverage (each log query paged to its total)', '| query | total | collected | complete |', '|---|---|---|---|');
  for (const c of coverage) lines.push(`| ${JSON.stringify(c.args)} | ${c.total ?? '?'} | ${c.returned} | ${c.complete ? 'yes' : `NO${c.error ? ` (${c.error})` : ''}`} |`);
  lines.push('', `Unique log entries: ${logs.length} (file logs.json, sorted by ts). Entity timelines: entities.json. KB articles in full: kb.md.`, '');
  lines.push('## Services', '| service | entries | first | last | messages (count) |', '|---|---|---|---|---|');
  for (const [name, s] of services) lines.push(`| ${name} | ${s.count} | ${s.first} | ${s.last} | ${[...s.messages].slice(0, 8).map(([m, n]) => `${m} (${n})`).join('; ')} |`);
  lines.push('', '## Change events (deploys, releases, versions, flags; grouped by the id as logged)');
  for (const r of [...releases.values()].sort((a, b) => a.events[0].ts.localeCompare(b.events[0].ts))) {
    lines.push(`- **${r.release}**`);
    for (const ev of r.events.slice(0, 6)) lines.push(`  - ${ev.ts} ${ev.service}: ${ev.message}${ev.components ? ` components=${JSON.stringify(ev.components)}` : ''}${ev.changes ? ` changes=${JSON.stringify(ev.changes)}` : ''}${ev.flags && Object.keys(ev.flags).length ? ` flags=${JSON.stringify(ev.flags)}` : ''}`);
  }
  lines.push('', '## Feature flags (as logged)');
  for (const [k, list] of flags) lines.push(`- \`${k}\`: ${list.map(f => `${f.ts} ${JSON.stringify(f.value)} (${f.service})`).join('; ')}`);
  lines.push('', `## Entities (${entities.size}; timelines in entities.json)`);
  for (const [id, list] of [...entities].sort()) lines.push(`- ${id}: ${list.length} events, ${[...new Set(list.map(x => x.service))].join(', ')}`);
  lines.push('', '## Knowledge base articles (read kb.md in full: naming and scope rules decide the answer)');
  for (const a of articles) lines.push(`- ${a.id ?? '?'}: ${a.title ?? ''}`);
  return { markdown: lines.join('\n') + '\n', logs, entities: Object.fromEntries([...entities].sort()) };
}

function articlesOf(j) {
  const list = Array.isArray(j?.articles) ? j.articles : Array.isArray(j?.results) ? j.results : Array.isArray(j) ? j : j?.article ? [j.article] : [];
  return list.filter(a => a && typeof a === 'object');
}

/**
 * Collects every log entry and the incident rules for one PI into dir.
 * @param {{call:(name:string,args:object)=>Promise<{isError?:boolean,text?:string}>, defs:object[], dir:string,
 *          brief?:{key?:string,title?:string,description?:string}, maxCalls?:number, budgetMs?:number}} o
 */
export async function collectIncident({ call, defs, dir, brief = {}, maxCalls = 80, budgetMs = 75000 }) {
  const started = Date.now();
  const budget = { calls: maxCalls, until: started + budgetMs };
  const t = pickTools(defs);
  mkdirSync(dir, { recursive: true });
  const problems = [];
  const seen = new Map();
  const coverage = [];
  // Knowledge base: incident rules, the brief's own words, then every KB id the articles reference.
  const articles = new Map();
  if (!t.kbTool) problems.push('no knowledge-base tool in the Company Tools list');
  else {
    const queries = ['incident report', 'incident report naming release component containment flag scope',
      brief.title ?? '', ...(String(brief.description ?? '').match(DOC_ID) ?? [])].filter(Boolean);
    const asked = new Set();
    for (let i = 0; i < queries.length && i < 12; i++) {
      const q = queries[i];
      if (asked.has(q) || budget.calls <= 0 || Date.now() > budget.until) continue;
      asked.add(q); budget.calls--;
      const args = { [t.kbQueryKey ?? 'query']: q };
      if (t.kbLimitKey) args[t.kbLimitKey] = t.kbLimitMax ?? 10;
      try {
        const r = await call(t.kbTool.name, args);
        if (r?.isError) { problems.push(`kb "${q}": ${String(r.text ?? '').slice(0, 120)}`); continue; }
        for (const a of articlesOf(parse(r?.text))) {
          const id = a.id ?? a.key ?? a.title;
          if (!articles.has(id)) articles.set(id, a);
          // Follow references to other articles (ids shaped like the ids of the articles already found).
          const prefix = String(id).match(/^([A-Za-z]+)-/)?.[1];
          const refRe = prefix ? new RegExp(`\\b${prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)*\\b`, 'g') : DOC_ID;
          for (const ref of String(a.body ?? a.content ?? '').match(refRe) ?? []) if (!asked.has(ref) && !articles.has(ref)) queries.push(ref);
        }
      } catch (e) { problems.push(`kb "${q}": ${e.code ?? 'ERROR'}`); }
    }
  }
  if (!t.logTool) problems.push('no log search tool in the Company Tools list');
  else {
    // 1. Everything at once (no filter). 2. If the tool needs a filter: an empty query. 3. One query per service.
    const attempts = [{}];
    if (required(t.logTool).length || t.queryKey) attempts.push(t.queryKey ? { [t.queryKey]: '' } : {});
    let all = null;
    for (const a of attempts) {
      if (required(t.logTool).some(k => !(k in a))) continue;
      const r = await pageAll(call, t, a, seen, budget);
      coverage.push(r);
      if (!r.error && r.returned > 0) { all = r; break; }
    }
    // Services the brief names ("the rule engine and the deploy pipeline log to ...") that the unfiltered dump did
    // not contain: query them too, even when that dump looked complete (6QYJQAVJ PI-02: the unfiltered dump held no
    // `rule-engine` entries, so the orchestrator searched by hand for 7 minutes).
    const phrase = /\b([a-z][a-z0-9]+)[ -](engine|service|pipeline|worker|scheduler|api|gateway|server|queue|job|sync|importer|exporter|processor)s?\b/gi;
    const present = new Set([...seen.values()].map(e => e?.service).filter(Boolean));
    const fromBrief = new Set();
    for (const m of String(brief.description ?? '').matchAll(phrase)) {
      const a1 = m[1].toLowerCase(), b1 = m[2].toLowerCase();
      if (['the', 'a', 'an', 'our', 'their', 'its', 'this', 'that', 'each', 'every'].includes(a1)) continue;
      for (const n of [`${a1}-${b1}`, `${a1}s-${b1}`]) if (!present.has(n)) fromBrief.add(n);
    }
    if (all && all.complete && t.serviceKey) {
      for (const svc of fromBrief) {
        const r = await pageAll(call, t, { [t.serviceKey]: svc }, seen, budget);
        if (r.returned > 0 || r.error) coverage.push(r);
      }
    }
    // Per-service queries as well when the unfiltered dump is incomplete, failed, or capped by a default window.
    if (!all || !all.complete) {
      const named = new Set();
      for (const e of seen.values()) if (e?.service) named.add(e.service);
      const text = `${brief.description ?? ''} ${[...articles.values()].map(a => a.body ?? a.content ?? '').join(' ')}`;
      for (const m of text.matchAll(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g)) if (m[0].length < 32) named.add(m[0]);
      for (const n of fromBrief) named.add(n);
      for (const g of GENERIC_SERVICES) named.add(g);
      for (const svc of named) {
        const a = t.serviceKey ? { [t.serviceKey]: svc } : t.queryKey ? { [t.queryKey]: svc } : null;
        if (!a) break;
        coverage.push(await pageAll(call, t, a, seen, budget));
      }
    }
    for (const c of coverage) if (!c.complete && !c.error) c.error = 'not paged to its total';
  }
  const kb = [...articles.values()];
  const d = digestOf([...seen.values()], kb, coverage, brief);
  writeFileSync(join(dir, 'logs.json'), JSON.stringify(d.logs, null, 1));
  writeFileSync(join(dir, 'entities.json'), JSON.stringify(d.entities, null, 1));
  writeFileSync(join(dir, 'kb.md'), kb.map(a => `## ${a.id ?? ''} ${a.title ?? ''}\n\n${a.body ?? a.content ?? JSON.stringify(a)}\n`).join('\n'));
  writeFileSync(join(dir, 'digest.md'), d.markdown);
  // Starter for the solving script: data loaded and joined, nothing decided (the KB rules decide).
  writeFileSync(join(dir, 'solve-starter.mjs'), [
    "// Copy to ../solve.mjs and complete. Prints facts; every answer field must follow the KB definitions (kb.md).",
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const here = dirname(fileURLToPath(import.meta.url));",
    "const logs = JSON.parse(readFileSync(join(here, 'logs.json'), 'utf8'));      // all entries, sorted by ts",
    "const entities = JSON.parse(readFileSync(join(here, 'entities.json'), 'utf8')); // id -> events in time order",
    "const kb = readFileSync(join(here, 'kb.md'), 'utf8');",
    "const by = (pred) => logs.filter(pred);",
    "const service = (name) => by(e => e.service === name);",
    "const firstOf = (list) => [...list].sort((a, b) => a.ts.localeCompare(b.ts))[0] ?? null;",
    "// For each entity: the events before a given event (e.g. what was true when it happened).",
    "const before = (id, ts) => (entities[id] ?? []).filter(e => e.ts < ts);",
    "const result = {};   // fill: one key per field the brief asks for, values exactly as logged",
    "const proof = {};    // fill: the log rows that prove each value",
    "console.log(JSON.stringify({ result, proof }, null, 2));",
    "writeFileSync(join(here, '..', 'investigation.json'), JSON.stringify({ result, proof }, null, 2));",
    "export { logs, entities, kb, by, service, firstOf, before };", ''].join('\n'));
  const complete = coverage.length > 0 && coverage.some(c => c.complete) && !coverage.some(c => c.error && c.returned > 0 && !c.complete);
  const summary = { dir, files: { digest: join(dir, 'digest.md'), logs: join(dir, 'logs.json'), entities: join(dir, 'entities.json'), kb: join(dir, 'kb.md') },
    logEntries: d.logs.length, kbArticles: kb.map(a => a.id ?? a.title), complete, calls: maxCalls - budget.calls,
    ms: Date.now() - started, coverage: coverage.map(c => ({ args: c.args, total: c.total, collected: c.returned, complete: c.complete, ...(c.error ? { error: c.error } : {}) })),
    problems };
  writeFileSync(join(dir, 'collection.json'), JSON.stringify(summary, null, 2));
  return summary;
}
