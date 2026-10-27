#!/usr/bin/env node
// MCP Helper (stdio, newline-delimited JSON-RPC). stdout carries JSON-RPC only.
import { createInterface } from 'node:readline';
import { MatchSession, ToolError } from '../src/runtime-session.mjs';

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
    description: 'Block up to timeoutMs (default and max 240000) until the match changes (new item, status/score change, ' +
      'pause/end) or a worker finished a slot (reason SLOT_DONE with slotDone[]). Returns {changed, reason, board}. While idle call it again right away without writing any message; ' +
      'an empty backlog is never the end of the match.',
    inputSchema: obj({ timeoutMs: { type: 'integer', minimum: 5000, maximum: 240000 } }) },
  { name: 'prepare_slots', handler: a => session.prepareSlots(a),
    description: 'Create (or keep, on resume) up to 3 worker slots: Git worktrees of the assigned repository at ' +
      '<checkoutRoot>.slots/sN on local-only branches mtm-slot/sN (never pushed). copyFiles copies git-ignored local files ' +
      '(e.g. src/.env) from matchRoot into each slot; replace {"find":"with {slot}"} makes per-slot values such as database ' +
      'names or ports. Does not change tracked files of the checkout.',
    inputSchema: obj({ count: { type: 'integer', minimum: 1, maximum: 3 },
      copyFiles: { type: 'array', maxItems: 10, items: { anyOf: [{ type: 'string' },
        obj({ path: { type: 'string' }, replace: { type: 'object', additionalProperties: { type: 'string' } } }, ['path'])] } } }) },
  { name: 'start_work', handler: a => session.startWork(a),
    description: 'Start Work for one OPEN item (required before editing and before submit). Returns the full brief (item), ' +
      'startInstruction, submitTemplate, MVS and requiredTestCases; creates <matchRoot>/answers/<ID>/submit.json from the ' +
      'template and the evidence/ folder; logs IN_PROGRESS and BACKLOG_TESTS NOT_RUN. No get_backlog_item call is needed ' +
      'afterwards. Calling again for a started item is a harmless replay.',
    inputSchema: obj({ backlogItemKey: key, slot: { type: 'string', enum: ['s1', 's2', 's3'],
      description: 'Worker slot. The slot is reset to the checkout HEAD, the answer folder is created there, and the full brief, ' +
        'organizer files, schema and a validator are written to <slotMatchRoot>/.mtm-tmp/<ID>/; the result is then a short ' +
        'summary with briefFile/doneFile for the worker instead of the whole brief.' } }, ['backlogItemKey']) },
  { name: 'integrate_item', handler: a => session.integrateItem(a),
    description: "Bring a worker's committed slot work onto the assigned branch and submit it: checks the slot is committed, " +
      'only the assigned folder changed and no credential is in the diff; git pull --rebase, cherry-pick the slot commits, ' +
      'push (never force); then runs submit_work unchanged (all its gates) with the counts from the slot DONE.json unless ' +
      '`tests` is given. INTEGRATION_CONFLICT aborts cleanly and nothing is pushed or sent. Frees the slot when submitted.',
    inputSchema: obj({ backlogItemKey: key,
      tests: obj({ required: { type: 'integer' }, executed: { type: 'integer' }, passed: { type: 'integer' }, failed: { type: 'integer' },
        skipped: { type: 'integer' }, summary: { type: 'string' } }, ['required', 'executed', 'passed', 'failed']),
      acknowledgeTestChanges: { type: 'string' },
      allowUncommitted: { type: 'boolean', description: 'Safety net only: integrate the last commit and ignore uncommitted edits.' } },
    ['backlogItemKey']) },
  { name: 'release_slot', handler: a => session.releaseSlot(a),
    description: 'Free a slot without submitting (item dropped). Its worktree is reset at the next start_work.',
    inputSchema: obj({ slot: { type: 'string', enum: ['s1', 's2', 's3'] } }, ['slot']) },
  { name: 'validate_answer', handler: a => session.validateAnswer(a),
    description: 'Check the working-tree answers/<ID>/submit.json against the submit schema delivered at Start Work, ' +
      'PASS rows having evidence arrays, and every evidence/<file> existing. Run it before committing; fix until valid.',
    inputSchema: obj({ backlogItemKey: key }, ['backlogItemKey']) },
  { name: 'submit_work', handler: a => session.submitWork(a),
    description: 'Submit one started item ONCE. Commit source + answers/<ID>/submit.json + evidence first and push to the ' +
      'assigned branch. Pass the real test counts in `tests` (required, executed, passed, failed, skipped, summary): the helper ' +
      'logs the final BACKLOG_TESTS event, verifies the pushed revision (answer valid against the submit schema, every ' +
      'evidence/<file> committed, no existing test weakened, no scratch files), sends it with gitRevision and an idempotency ' +
      'key, retries safely, logs SUBMITTED with the receipt and returns the refreshed board (no refresh_match needed). ' +
      'Nothing is sent when a check fails.',
    inputSchema: obj({ backlogItemKey: key, gitRevision: { type: 'string', description: 'Full SHA; defaults to HEAD of checkoutRoot.' },
      tests: obj({ required: { type: 'integer' }, executed: { type: 'integer' }, passed: { type: 'integer' }, failed: { type: 'integer' },
        skipped: { type: 'integer' }, summary: { type: 'string' } }, ['required', 'executed', 'passed', 'failed']),
      acknowledgeTestChanges: { type: 'string', description: 'Only when the brief explicitly allows correcting an existing test: the reason, also written in the answer.' } },
    ['backlogItemKey', 'tests']) },
  { name: 'report_progress', handler: a => session.report(a.event),
    description: 'Append one progress event (without schemaVersion/playerSessionId; they are added). Types: PREPARATION_STATUS, ' +
      'ENVIRONMENT_READY, GAME_START_STATUS, BACKLOG_STATUS, BACKLOG_TESTS, BLOCKER_OPENED, BLOCKER_RESOLVED, ' +
      'ORCHESTRATOR_RESTARTED, ORCHESTRATOR_ENDED, MODEL_USAGE. Invalid events are rejected with the reason.',
    inputSchema: obj({ event: { type: 'object' } }, ['event']) },
  { name: 'company_tools_list', handler: () => session.companyTools(),
    description: "List the match's Company Tools (the customer's internal systems for this match: logs, tickets, docs, ...). " +
      'Their information is authoritative. Needs the START_GAME descriptor.',
    inputSchema: obj({}) },
  { name: 'company_tool_call', handler: a => session.companyCall(a),
    description: 'Call one Company Tool by name with its arguments. Pass backlogId when the call is for a backlog item.',
    inputSchema: obj({ name: { type: 'string' }, arguments: { type: 'object' }, backlogId: { type: 'string' },
      saveToSlot: { type: 'boolean', description: "Write the full answer into the item's slot (.mtm-tmp/<ID>/company-*.txt) and return only a short head." } }, ['name']) }
];

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const SECRET = /(Bearer\s+)[^\s"']+|gm_(?:live|test|team|player)_[A-Za-z0-9_\-]+/g;

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mtm_helper', version: '1.3.0' } } });
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
