#!/usr/bin/env node
// MCP Helper (stdio, newline-delimited JSON-RPC). stdout carries JSON-RPC only.
import { createInterface } from 'node:readline';
import { MatchSession, ToolError } from '../src/runtime-session.mjs';
import { startJobs, waitJobs } from '../src/jobs.mjs';

const session = new MatchSession();
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const key = { type: 'string', description: 'Backlog ID shown on /match, e.g. TASK-01, CR-02, BUG-01, PI-01.' };

const TOOLS = [
  { name: 'configure_session', handler: a => session.configure(a),
    description: 'Load the machine-provided descriptor(s). Pass every lifecycle descriptor of this match in order ' +
      '(PREPARE_GAME then START_GAME, or RESUME_*), each as the exact JSON object or the raw frame text. ' +
      'Credentials stay in helper memory; the result never echoes them. Call again after every new frame.',
    inputSchema: obj({ descriptors: { type: 'array', items: {}, minItems: 1, maxItems: 4 } }, ['descriptors']) },
  { name: 'login_match', handler: () => session.login(),
    description: 'Log in to the Game Master portal with the descriptor account (cookie kept in memory).',
    inputSchema: obj({}) },
  { name: 'refresh_match', handler: () => session.refresh(),
    description: 'Read /match/<matchId>: match status and clock, team, Start/Submit endpoints and every visible backlog item. ' +
      'During the game it logs DISCOVERED for new items. Long fields are shortened; use get_backlog_item for the full brief.',
    inputSchema: obj({}) },
  { name: 'get_backlog_item', handler: a => session.getItem(a),
    description: 'Full JSON of one visible backlog item (brief, acceptance criteria, deadline, points, statuses).',
    inputSchema: obj({ key, refresh: { type: 'boolean' } }, ['key']) },
  { name: 'wait_for_update', handler: a => session.waitForUpdate(a),
    description: 'Block up to 240 s (timeoutMs is ignored) until something needs you: reason AUTO_SUBMITTED (autoSubmitted[]: ' +
      'the helper integrated and submitted a clean DONE item itself - status DONE, no doubts, quality gate PASS - each with ' +
      'suggestNext {backlogItemKey, why, worker} for its free slot; worker "same" = followup_task the same agent, "pi_agent" = followup_task that slot\'s PI agent; PIs are submitted the same way), SLOT_DONE (slotDone[]: a slot ' +
      'wrote its DONE.json and needs your decision; suggestNext, autoIntegrateError when auto-submission failed), DEADLINE_SOON (deadlineSoon[]: a busy item is 3 minutes from its deadline or from the match ' +
      'end, a heavy item about 1.5 minutes with heavy: true - integrate its last commit at once; reported once each), NEW_PI (incident{}: a PI was revealed; the helper already started it in a free PI slot - s7/s8 ' +
      '- and collected every log page and the incident rules into incident.dir: digest.md, logs.json, entities.json, kb.md; ' +
      'it outranks every other reason and arrives once per PI; piAgents[] = the PI agents\' item slots s5/s6 with their item and slack), JOBS_DONE (jobs[]: a background job from preparation - slot install, baseline run - ended; ' +
      'reported once each), MATCH_UPDATED (new item or status change; newItems[]) or MATCH_<status> (pause/end). ' +
      'Returns within about 5 s of the event, with a compact board (items carry minutesLeft to their deadline, match.minutesLeft; ' +
      'effort S/M/L/XL ' +
      'from the brief, heavy (XL) or heavyCandidate (L) with effortReasons, gradingKind). ' +
      'While a PI is open, SLOT_DONE is reported only for deadline items; other finished slots show ' +
      'DONE_HELD_FOR_PI (board.heldForPi) until the PI is submitted. A slotDone entry carries qualityGate {kind, status, ' +
      'minutesLeft} when the brief names a quality gate; status MISSING with time left goes back to the worker once. ' +
      'While idle call it again right away without writing any message; an empty backlog is never the end of the match. ' +
      'timeoutMs is honoured only within 5 minutes after a DEADLINE_SOON (safety net: wait ~60 s for the DONE.json). ' +
      'In an exec cell put // @exec: {"yield_time_ms": 270000} on the first line.',
    inputSchema: obj({ timeoutMs: { type: 'integer', minimum: 5000, maximum: 240000 },
      noWait: { type: 'boolean', description: 'Check once and return at once (reason TIMEOUT when nothing happened): ' +
        'used between steps of a multi-step handling.' } }) },
  { name: 'prepare_incident', handler: a => session.prepareIncident(a),
    description: 'Incident fast path by hand (normally automatic: wait_for_update reason NEW_PI). Starts the PI in a free slot ' +
      '(s7/s8, or `slot`) if not started, pages every Company Tools log query to its total and fetches the incident rules ' +
      '(plus every KB article they reference) into <slotMatchRoot>/.mtm-tmp/<ID>/incident/: digest.md (coverage, services, ' +
      'releases, flags, entities), logs.json (all entries, by time), entities.json (timeline per invoice/ticket id), kb.md. ' +
      'Returns slot, briefFile, answerFile, validateCommand, doneFile and the coverage. refresh re-collects.',
    inputSchema: obj({ backlogItemKey: key, slot: { type: 'string', enum: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] }, refresh: { type: 'boolean' } }, ['backlogItemKey']) },
  { name: 'prepare_slots', handler: a => session.prepareSlots(a),
    description: 'Create (or keep, on resume) up to 8 slots (s1-s4 for the 4 workers, s5-s6 for items of the two PI agents, s7-s8 for PIs only): Git worktrees of the assigned repository at ' +
      '<checkoutRoot>.slots/sN on local-only branches mtm-slot/sN (never pushed). copyFiles copies git-ignored local files ' +
      '(e.g. src/.env) from matchRoot into each slot; replace {"find":"with {slot}"} makes per-slot values such as database ' +
      'names or ports. Does not change tracked files of the checkout.',
    inputSchema: obj({ count: { type: 'integer', minimum: 1, maximum: 8 },
      copyFiles: { type: 'array', maxItems: 10, items: { anyOf: [{ type: 'string' },
        obj({ path: { type: 'string' }, replace: { type: 'object', additionalProperties: { type: 'string' } } }, ['path'])] } } }) },
  { name: 'start_work', handler: a => session.startWork(a),
    description: 'Start Work for one OPEN item (required before editing and before submit). Returns the full brief (item), ' +
      'startInstruction, submitTemplate, MVS and requiredTestCases; creates <matchRoot>/answers/<ID>/submit.json from the ' +
      'template and the evidence/ folder; logs IN_PROGRESS and BACKLOG_TESTS NOT_RUN. No get_backlog_item call is needed ' +
      'afterwards. Calling again for a started item is a harmless replay.',
    inputSchema: obj({ backlogItemKey: key, slot: { type: 'string', enum: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
      description: 'Slot (s1-s4 for workers, s5-s6 for a PI agent\'s item, s7-s8 for PIs only: PI_SLOT_RESERVED otherwise). The slot is reset to the checkout HEAD, the answer folder is created there, and the full brief, ' +
        'organizer files, schema and a validator are written to <slotMatchRoot>/.mtm-tmp/<ID>/; the result is then a short ' +
        'summary with briefFile/doneFile for the worker instead of the whole brief.' },
      force: { type: 'boolean', description: 'Start an item without a deadline although a deadline item waits for a slot ' +
        '(DEADLINE_ITEM_WAITING). Only when that deadline item cannot be finished in time.' } }, ['backlogItemKey']) },
  { name: 'integrate_item', handler: a => session.integrateItem(a),
    description: "Bring a worker's committed slot work onto the assigned branch and submit it: checks the slot is committed, " +
      'only the assigned folder changed and no credential is in the diff; git pull --rebase, cherry-pick the slot commits, ' +
      'push (never force); then runs submit_work unchanged (all its gates) with the counts from the slot DONE.json unless ' +
      '`tests` is given. INTEGRATION_CONFLICT aborts cleanly and nothing is pushed or sent. Frees the slot when submitted.',
    inputSchema: obj({ backlogItemKey: key,
      tests: obj({ required: { type: 'integer' }, executed: { type: 'integer' }, passed: { type: 'integer' }, failed: { type: 'integer' },
        skipped: { type: 'integer' }, summary: { type: 'string' } }, ['required', 'executed', 'passed', 'failed']),
      acknowledgeTestChanges: { type: 'string' },
      allowUncommitted: { type: 'boolean', description: 'Safety net only: integrate the last commit and ignore uncommitted edits.' },
      next: { type: 'string', description: "After a successful submit, start this item in the same slot (next item of the worker's group); the result carries next = its slot summary." } },
    ['backlogItemKey']) },
  { name: 'apply_baseline', handler: a => session.applyBaseline(a),
    description: 'Commit and push the baseline repair prepared and tested by the scout (<matchRoot>/.mtm-tmp/baseline/baseline.patch) ' +
      'as part of a started item, before workers branch. Checks: item started, checkout clean, patch only inside the assigned folder, ' +
      'no credential; pull --rebase, apply, commit "<ID>: baseline repair", push (never force). Idempotent.',
    inputSchema: obj({ backlogItemKey: key, summary: { type: 'string', description: 'One line: failing test, cause, fix.' } }, ['backlogItemKey']) },
  { name: 'release_slot', handler: a => session.releaseSlot(a),
    description: 'Free a slot without submitting (item dropped). Its worktree is reset at the next start_work.',
    inputSchema: obj({ slot: { type: 'string', enum: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] } }, ['slot']) },
  { name: 'validate_answer', handler: a => session.validateAnswer(a),
    description: 'Check the working-tree answers/<ID>/submit.json against the submit schema delivered at Start Work, ' +
      'PASS rows having evidence arrays, and every evidence/<file> existing. Run it before committing; fix until valid.',
    inputSchema: obj({ backlogItemKey: key }, ['backlogItemKey']) },
  { name: 'answer_item', handler: a => session.answerItem(a),
    description: 'Value answers in ONE call (PI, TASK questions; items without source changes). Fills the started item\'s ' +
      'answers/<ID>/submit.json template with `values` (template keys only, exactly as found), merges `record` into the ' +
      'template\'s *Record object, writes `evidence` files ({"name.json": content | {from: absolutePath}}) and lists them, ' +
      'sets status, validates (returns INVALID with problems, nothing committed), commits answers/<ID> in the slot and writes ' +
      'DONE.json. integrate: true (orchestrator only) then integrates and submits it like integrate_item.',
    inputSchema: obj({ backlogItemKey: key, values: { type: 'object' }, record: { type: 'object' }, evidence: { type: 'object' },
      status: { type: 'string', enum: ['DONE', 'PARTIAL', 'BLOCKED'] }, integrate: { type: 'boolean' } }, ['backlogItemKey']) },
  { name: 'submit_work', handler: a => session.submitWork(a),
    description: 'Submit one started item ONCE. Commit source + answers/<ID>/submit.json + evidence first and push to the ' +
      'assigned branch. Test counts come from the answer\'s testResults rows (one per template test case: required = rows, ' +
      'passed = PASS rows, failed = FAIL rows); `tests` is only for items whose template has no rows. The helper ' +
      'logs the final BACKLOG_TESTS event, verifies the pushed revision (answer valid against the submit schema, every ' +
      'evidence/<file> committed, no existing test weakened, no scratch files), sends it with gitRevision and an idempotency ' +
      'key, retries safely, logs SUBMITTED with the receipt and returns the refreshed board (no refresh_match needed). ' +
      'Nothing is sent when a check fails.',
    inputSchema: obj({ backlogItemKey: key, gitRevision: { type: 'string', description: 'Full SHA; defaults to HEAD of checkoutRoot.' },
      tests: obj({ required: { type: 'integer' }, executed: { type: 'integer' }, passed: { type: 'integer' }, failed: { type: 'integer' },
        skipped: { type: 'integer' }, summary: { type: 'string' } }, ['required', 'executed', 'passed', 'failed']),
      acknowledgeTestChanges: { type: 'string', description: 'Only when the brief explicitly allows correcting an existing test: the reason, also written in the answer.' } },
    ['backlogItemKey']) },
  { name: 'report_progress', handler: a => session.report(a.event),
    description: 'Append one progress event (without schemaVersion/playerSessionId; they are added). Types: PREPARATION_STATUS, ' +
      'ENVIRONMENT_READY, GAME_START_STATUS, BACKLOG_STATUS, BACKLOG_TESTS, BLOCKER_OPENED, BLOCKER_RESOLVED, ' +
      'ORCHESTRATOR_RESTARTED, ORCHESTRATOR_ENDED, MODEL_USAGE. Invalid events are rejected with the reason.',
    inputSchema: obj({ event: { type: 'object' } }, ['event']) },
  { name: 'company_tools_list', handler: a => session.companyTools(a),
    description: "List the match's Company Tools (the customer's internal systems for this match: logs, tickets, docs, ...). " +
      'Their information is authoritative. Orchestrator: needs the START_GAME descriptor. Worker subagent: pass your ' +
      'slotMatchRoot; the call is relayed through the orchestrator helper (no key needed).',
    inputSchema: obj({ slotMatchRoot: { type: 'string' } }) },
  { name: 'company_tool_call', handler: a => session.companyCallForModel(a),
    description: 'Call one Company Tool by name with its arguments. Pass backlogId when the call is for a backlog item. ' +
      'Answers over 6000 characters are saved to a file (the item\'s slot, else <matchRoot>/.mtm-tmp) and only a 300-character head returns.',
    inputSchema: obj({ name: { type: 'string' }, arguments: { type: 'object' }, backlogId: { type: 'string' },
      slotMatchRoot: { type: 'string', description: 'Worker subagents only: your slotMatchRoot; relays the call through the orchestrator helper.' },
      saveToSlot: { type: 'boolean', description: "Write the full answer into the item's slot (.mtm-tmp/<ID>/company-*.txt) and return only a short head." } }, ['name']) },
  { name: 'start_jobs', handler: a => startJobs(a),
    description: 'Start long commands (install, build, migrate, test runs, slot installs) as detached background jobs that ' +
      'outlive this turn. Each job writes <dir>/<name>.log and, when it ends, <name>.exit. Idempotent: a job that is RUNNING ' +
      'or DONE is not started again; a LOST one (process gone, no exit code) restarts. Windows commands run in pwsh. ' +
      'Never put passwords in a command (read them from git-ignored env files). Then call wait_jobs instead of polling logs.',
    inputSchema: obj({ dir: { type: 'string', description: 'Absolute folder inside a .mtm-tmp folder, e.g. <matchRoot>/.mtm-tmp/jobs.' },
      jobs: { type: 'array', minItems: 1, maxItems: 12, items: obj({ name: { type: 'string' }, cwd: { type: 'string' }, command: { type: 'string' } }, ['name', 'cwd', 'command']) },
      restartFailed: { type: 'boolean', description: 'Also restart jobs that ended with a non-zero exit code.' } }, ['dir', 'jobs']) },
  { name: 'wait_jobs', handler: a => waitJobs(a),
    description: 'Block (up to 280 s) until the named background jobs (default: every job in dir) are no longer RUNNING, then return ' +
      'each state (DONE / FAILED with exit code / LOST / RUNNING if the wait timed out) and the tail of its log. One call ' +
      'replaces minutes of polling; call it again if done is false. In an exec cell use // @exec: {"yield_time_ms": 290000}.',
    inputSchema: obj({ dir: { type: 'string' }, names: { type: 'array', items: { type: 'string' } },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 280000 }, tailLines: { type: 'integer', minimum: 0, maximum: 40 } }, ['dir']) }
];

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const SECRET = /(Bearer\s+)[^\s"']+|gm_(?:live|test|team|player)_[A-Za-z0-9_\-]+/g;

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mtm_helper', version: '1.3.1' } } });
  }
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool ${params?.name}` } });
    try {
      const result = await tool.handler(params?.arguments ?? {});
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] } });
    } catch (error) {
      const body = { error: { code: error instanceof ToolError ? error.code : (error?.code ?? 'INTERNAL_ERROR'),
        message: String(error?.message ?? error).replace(SECRET, '$1[REDACTED]').slice(0, 1000),
        ...(error?.details ? { details: error.details } : {}) } };
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] } });
    }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const batch = Array.isArray(msg) ? msg : [msg];
  for (const m of batch) handle(m).catch(e => send({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32603, message: String(e?.message ?? e).replace(SECRET, '$1[REDACTED]') } }));
});
rl.on('close', () => process.exit(0));
