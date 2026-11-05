#!/usr/bin/env node
// Post-match review (read-only, not part of the runtime package). Measures where tokens and minutes went:
//   node scripts/match-report.mjs --sessions <folder with the match's Codex rollout-*.jsonl> [--session <orchestrator id>]
//                                 [--timeline <checkoutRoot>/.git/mtm/timeline.ndjson] [--json]
// Tokens per agent (turns, total, average and largest context), short waits and sleeps, the largest tool results,
// and per item (from the helper timeline): wait for a slot, work time, wait for integration.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const sessionsDir = arg('--sessions');
const only = arg('--session');
const timelineFile = arg('--timeline');
if (!sessionsDir && !timelineFile) {
  console.error('usage: match-report.mjs --sessions <dir> [--session <id>] [--timeline <file>] [--json]');
  process.exit(2);
}

const lines = f => readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const text = o => typeof o === 'string' ? o : JSON.stringify(o ?? '');

function agentReport(file) {
  const rows = lines(file);
  const meta = rows.find(r => r.type === 'session_meta')?.payload ?? {};
  const out = { file, id: meta.id, parent: meta.parent_thread_id ?? null, role: meta.agent_role ?? (meta.parent_thread_id ? meta.thread_source : 'orchestrator'),
    path: meta.agent_path ?? null, turns: 0, totalTokens: 0, avgContext: 0, maxContext: 0, shortWaits: 0, sleeps: 0, images: 0, biggest: [] };
  const calls = new Map();
  let ctxSum = 0;
  for (const r of rows) {
    const p = r.payload ?? {};
    if (r.type === 'event_msg' && p.type === 'token_count' && p.info) {
      out.turns++;
      out.totalTokens = p.info.total_token_usage?.total_tokens ?? out.totalTokens;
      const ctx = p.info.last_token_usage?.input_tokens ?? 0;
      ctxSum += ctx; out.maxContext = Math.max(out.maxContext, ctx);
    }
    if (r.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(p.type)) {
      const a = text(p.arguments ?? p.input);
      calls.set(p.call_id, { name: p.name, at: r.timestamp, args: a });
      if (p.name === 'sleep') out.sleeps++;
      if (p.name === 'wait') { try { if ((JSON.parse(a).yield_time_ms ?? 0) < 120000) out.shortWaits++; } catch { /* ignore */ } }
      if (/view_image/.test(a)) out.images++;
    }
    if (r.type === 'response_item' && ['function_call_output', 'custom_tool_call_output'].includes(p.type)) {
      const o = text(p.output);
      const c = calls.get(p.call_id) ?? {};
      const helper = [...new Set((c.args ?? '').match(/mcp__mtm_helper__\w+/g) ?? [])].map(s => s.slice(17)).join(',');
      out.biggest.push({ chars: o.length, at: (c.at ?? r.timestamp ?? '').slice(11, 19), call: helper || (/view_image/.test(c.args ?? '') ? 'view_image' : c.name) });
    }
  }
  out.avgContext = out.turns ? Math.round(ctxSum / out.turns) : 0;
  out.biggest = out.biggest.sort((a, b) => b.chars - a.chars).slice(0, 5);
  return out;
}

function timelineReport(file) {
  const ev = lines(file);
  const items = new Map();
  const get = k => items.get(k) ?? items.set(k, { key: k }).get(k);
  for (const e of ev) {
    if (!e.key) continue;
    const it = get(e.key);
    if (e.event === 'DISCOVERED' && !it.discovered) Object.assign(it, { discovered: e.at, type: e.type, deadlineMinutes: e.deadlineMinutes });
    if (e.event === 'START_WORK' && !it.started) Object.assign(it, { started: e.at, slot: e.slot });
    if (e.event === 'SLOT_DONE_SEEN') Object.assign(it, { done: e.doneAt ?? e.at, seen: e.at });
    if (e.event === 'INCIDENT_READY') it.incidentReadySec = e.inSec;
    if (e.event === 'SUBMITTED') it.submitted = e.at;
  }
  const min = (a, b) => a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 6000) / 10 : null;
  return [...items.values()].map(i => ({ key: i.key, type: i.type ?? null, slot: i.slot ?? null, deadlineMinutes: i.deadlineMinutes ?? null,
    waitForSlotMin: min(i.discovered, i.started), workMin: min(i.started, i.done), waitForIntegrationMin: min(i.done, i.submitted),
    totalMin: min(i.discovered, i.submitted), ...(i.incidentReadySec != null ? { incidentReadySec: i.incidentReadySec } : {}) }));
}

const result = {};
if (sessionsDir) {
  const files = readdirSync(sessionsDir).filter(f => /^rollout-.*\.jsonl$/.test(f)).map(f => join(sessionsDir, f));
  let agents = files.map(agentReport).filter(a => a.turns > 0);
  if (only) agents = agents.filter(a => a.id === only || a.parent === only);
  const total = agents.reduce((s, a) => s + a.totalTokens, 0);
  result.tokens = { total, agents: agents.map(a => ({ role: a.role, path: a.path, turns: a.turns, totalTokens: a.totalTokens,
    share: total ? `${Math.round(100 * a.totalTokens / total)}%` : null, avgContext: a.avgContext, maxContext: a.maxContext,
    shortWaits: a.shortWaits, sleeps: a.sleeps, images: a.images, biggest: a.biggest })) };
}
if (timelineFile && existsSync(timelineFile)) result.items = timelineReport(timelineFile);

if (process.argv.includes('--json')) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
if (result.tokens) {
  console.log(`Tokens: ${(result.tokens.total / 1e6).toFixed(2)}M`);
  for (const a of result.tokens.agents) {
    console.log(`  ${String(a.role).padEnd(20)} ${String(a.path ?? '').padEnd(14)} ${(a.totalTokens / 1e6).toFixed(2)}M ${String(a.share).padStart(4)}` +
      `  turns ${a.turns}  ctx avg ${Math.round(a.avgContext / 1000)}k max ${Math.round(a.maxContext / 1000)}k` +
      `  short waits ${a.shortWaits}  sleeps ${a.sleeps}  images ${a.images}`);
    for (const b of a.biggest.filter(b => b.chars > 20000)) console.log(`      big result ${b.at} ${b.call}: ${Math.round(b.chars / 1000)}k chars`);
  }
}
if (result.items) {
  console.log('Items (minutes): waitForSlot / work / waitForIntegration / total');
  for (const i of result.items) {
    console.log(`  ${i.key.padEnd(8)} ${String(i.slot ?? '-').padEnd(3)} ${[i.waitForSlotMin, i.workMin, i.waitForIntegrationMin, i.totalMin].map(v => v ?? '-').join(' / ')}` +
      `${i.deadlineMinutes ? `  (deadline ${i.deadlineMinutes})` : ''}`);
  }
}
