// Emits one line per notable progress event and per Player state change of a match.
import { existsSync, readFileSync } from 'node:fs';
const [logFile, skip] = process.argv.slice(2);
// On re-arm, skip lines already reported.
let seen = skip === 'resume' && existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0;
let lastState = '';
const pick = e => {
  const t = e.type;
  if (t === 'PREPARATION_STATUS' && e.status !== 'IN_PROGRESS') return `PREP ${e.stage} ${e.status}: ${e.summary}`;
  if (t === 'ENVIRONMENT_READY') return `ENVIRONMENT_READY rev ${e.revision.slice(0, 7)}`;
  if (t === 'GAME_START_STATUS' && e.status !== 'IN_PROGRESS') return `BACKLOG_SYNC ${e.status}`;
  if (t === 'BACKLOG_STATUS') return `${e.backlogId} ${e.status}: ${e.title}${e.receiptId ? ' (receipt)' : ''}`;
  if (t === 'BACKLOG_TESTS' && ['PASSED', 'FAILED'].includes(e.status)) return `${e.backlogId} TESTS ${e.status} ${e.passed}/${e.executed}`;
  if (t === 'GAME_MASTER_API' && e.phase === 'FAILED') return `API FAILED ${e.operation} ${e.backlogId ?? ''} ${e.httpStatus ?? ''}: ${e.summary}`;
  if (t === 'TOOL_ACTIVITY' && e.phase === 'FAILED') return null;
  if (t.startsWith('BLOCKER') || t.startsWith('ORCHESTRATOR_') && t !== 'ORCHESTRATOR_STARTED') return `${t}: ${e.summary}`;
  return null;
};
for (;;) {
  try {
    if (existsSync(logFile)) {
      const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
      for (const l of lines.slice(seen)) { try { const m = pick(JSON.parse(l)); if (m) console.log(m); } catch {} }
      seen = lines.length;
    }
    const h = await (await fetch('http://127.0.0.1:54321/health', { signal: AbortSignal.timeout(4000) })).json();
    const m = h.match ?? {}, c = m.cli ?? {};
    const state = `PLAYER phase=${m.phase} official=${m.officialStatus} agent=${m.agentState}${c.lastError ? ' error=' + c.lastError : ''}`;
    if (state !== lastState) { console.log(state); lastState = state; }
    if (['FINISHED', 'CANCELLED'].includes(m.officialStatus) && m.agentState === 'STOPPED') { console.log('MATCH OVER'); process.exit(0); }
  } catch (e) { /* transient */ }
  await new Promise(r => setTimeout(r, 5000));
}
