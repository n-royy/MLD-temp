// Progress NDJSON writer. Mirrors the validation MTM Player applies to each line so an
// event rejected here would also be rejected (or hidden) on the Player dashboard.
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const SHA = /^[a-f0-9]{40,64}$/;
const id = v => typeof v === 'string' && v.length >= 1 && v.length <= 128 && ID.test(v);
const nullableId = v => v === null || id(v);
const text = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max && !/[\r\n\0]/.test(v);
const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 100000;
const usage = v => Number.isSafeInteger(v) && v >= 0 && v <= 1e12;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...keys].sort());
const origin = v => typeof v === 'string' && v.length <= 256 && /^https:\/\/[^/?#]+$/.test(v);
const path = v => typeof v === 'string' && v.length >= 1 && v.length <= 512 && /^\/[^?#\\]*$/.test(v);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const PHASES = ['REQUESTED', 'SUCCEEDED', 'FAILED'];
const STATUSES = ['IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'FAILED'];
const BASE = ['schemaVersion', 'playerSessionId', 'type'];

export const BACKLOG_ORDER = { DISCOVERED: 0, IN_PROGRESS: 1, BLOCKED: 1, FAILED: 1, COMPLETED: 2, SUBMITTED: 3 };

/** Returns null when valid, otherwise a short reason. */
export function validateEvent(e) {
  if (!e || e.schemaVersion !== 1 || !id(e.playerSessionId)) return 'envelope';
  const k = [...BASE];
  switch (e.type) {
    case 'ORCHESTRATOR_STARTED':
      return exact(e, [...k, 'summary']) && text(e.summary, 240) ? null : 'shape';
    case 'ORCHESTRATOR_RESTARTED':
      return exact(e, [...k, 'attempt', 'phase', 'reason', 'summary']) && Number.isSafeInteger(e.attempt) &&
        e.attempt >= 1 && e.attempt <= 10000 && ['PREPARATION', 'GAME'].includes(e.phase) && id(e.reason) &&
        text(e.summary, 240) ? null : 'shape';
    case 'PREPARATION_STATUS':
      return exact(e, [...k, 'stage', 'status', 'summary']) &&
        ['GIT_AUTH', 'REPOSITORY', 'ENVIRONMENT', 'BUILD', 'MATCH_LOGIN'].includes(e.stage) &&
        STATUSES.includes(e.status) && text(e.summary, 240) ? null : 'shape';
    case 'ENVIRONMENT_READY':
      return exact(e, [...k, 'requestId', 'repository', 'revision', 'build', 'matchLogin']) && id(e.requestId) &&
        exact(e.repository, ['url', 'branch', 'folder']) && /^https:\/\/[^@]+$/.test(e.repository.url) &&
        text(e.repository.branch, 255) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(e.repository.folder) &&
        SHA.test(e.revision) && e.build === 'PASS' && e.matchLogin === 'PASS' ? null : 'shape';
    case 'GAME_START_STATUS':
      return exact(e, [...k, 'stage', 'status', 'summary']) && e.stage === 'BACKLOG_SYNC' &&
        STATUSES.includes(e.status) && text(e.summary, 240) ? null : 'shape';
    case 'BACKLOG_STATUS':
      if (!exact(e, [...k, 'backlogId', 'title', 'status', 'summary', 'revision', 'receiptId']) || !id(e.backlogId) ||
        !text(e.title, 160) || !(e.status in BACKLOG_ORDER) || !text(e.summary, 240) ||
        !(e.revision === null || SHA.test(e.revision)) || !nullableId(e.receiptId)) return 'shape';
      return e.status === 'SUBMITTED' && (e.revision === null || e.receiptId === null) ? 'submitted-needs-receipt' : null;
    case 'BACKLOG_TESTS': {
      if (!exact(e, [...k, 'backlogId', 'status', 'required', 'executed', 'passed', 'failed', 'skipped', 'summary']) ||
        !id(e.backlogId) || !['NOT_RUN', 'RUNNING', 'PASSED', 'FAILED'].includes(e.status) || !text(e.summary, 240) ||
        ![e.required, e.executed, e.passed, e.failed, e.skipped].every(count)) return 'shape';
      if (e.executed !== e.passed + e.failed + e.skipped) return 'executed-must-equal-passed+failed+skipped';
      if (e.status === 'NOT_RUN' && e.executed !== 0) return 'not-run-with-executions';
      if (e.status === 'PASSED' && (e.executed === 0 || e.failed !== 0 || e.executed < e.required)) return 'passed-counts';
      if (e.status === 'FAILED' && e.failed === 0) return 'failed-counts';
      return null;
    }
    case 'GAME_MASTER_API':
      if (!exact(e, [...k, 'operation', 'backlogId', 'method', 'origin', 'path', 'phase', 'httpStatus', 'requestId', 'summary']) ||
        !id(e.operation) || !nullableId(e.backlogId) || !(e.method === null || METHODS.includes(e.method)) ||
        !(e.origin === null || origin(e.origin)) || !(e.path === null || path(e.path)) || !PHASES.includes(e.phase) ||
        !nullableId(e.requestId) || !text(e.summary, 240)) return 'shape';
      if (e.httpStatus !== null && !(Number.isSafeInteger(e.httpStatus) && e.httpStatus >= 100 && e.httpStatus <= 599)) return 'http';
      if (e.phase === 'REQUESTED' && e.httpStatus !== null) return 'http';
      if (e.phase === 'SUCCEEDED' && !(e.httpStatus >= 200 && e.httpStatus < 300)) return 'http';
      if (e.phase === 'FAILED' && !(e.httpStatus === null || e.httpStatus >= 400)) return 'http';
      return null;
    case 'MODEL_USAGE':
      return exact(e, [...k, 'model', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningTokens', 'summary']) &&
        text(e.model, 128) && [e.inputTokens, e.cachedInputTokens, e.outputTokens, e.reasoningTokens].every(usage) &&
        e.cachedInputTokens <= e.inputTokens && e.reasoningTokens <= e.outputTokens && text(e.summary, 240) ? null : 'shape';
    case 'TOOL_ACTIVITY':
      return exact(e, [...k, 'toolName', 'operation', 'backlogId', 'phase', 'summary']) && id(e.toolName) &&
        id(e.operation) && nullableId(e.backlogId) && PHASES.includes(e.phase) && text(e.summary, 240) ? null : 'shape';
    case 'NETWORK_ACTIVITY':
      return exact(e, [...k, 'operation', 'backlogId', 'method', 'origin', 'path', 'phase', 'httpStatus', 'requestId', 'summary']) &&
        id(e.operation) && nullableId(e.backlogId) && METHODS.includes(e.method) && origin(e.origin) && path(e.path) &&
        PHASES.includes(e.phase) && (e.httpStatus === null || (Number.isSafeInteger(e.httpStatus) && e.httpStatus >= 100 && e.httpStatus <= 599)) &&
        nullableId(e.requestId) && text(e.summary, 240) ? null : 'shape';
    case 'BLOCKER_OPENED':
      return exact(e, [...k, 'blockerId', 'backlogId', 'summary']) && id(e.blockerId) && nullableId(e.backlogId) &&
        text(e.summary, 240) ? null : 'shape';
    case 'BLOCKER_RESOLVED':
      return exact(e, [...k, 'blockerId', 'summary']) && id(e.blockerId) && text(e.summary, 240) ? null : 'shape';
    case 'ORCHESTRATOR_ENDED':
      return exact(e, [...k, 'status', 'summary']) && ['COMPLETED', 'BLOCKED', 'FAILED'].includes(e.status) &&
        text(e.summary, 240) ? null : 'shape';
    default:
      return 'unknown-type';
  }
}

export const clip = (value, max = 240) => {
  const s = String(value ?? '').replace(/[\r\n\0]+/g, ' ').trim() || '-';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

// Player stops rendering the dashboard above 256 KiB; keep headroom for mandatory events.
const SOFT_LIMIT = 200 * 1024;
const MANDATORY = new Set(['ENVIRONMENT_READY', 'BACKLOG_STATUS', 'ORCHESTRATOR_ENDED', 'ORCHESTRATOR_RESTARTED',
  'PREPARATION_STATUS', 'GAME_START_STATUS', 'BLOCKER_OPENED', 'BLOCKER_RESOLVED']);

export class ProgressLog {
  constructor(file, playerSessionId) {
    this.file = file;
    this.playerSessionId = playerSessionId;
    this.backlog = new Map(); // backlogId -> { status, title }
    this.queue = [];
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.type === 'BACKLOG_STATUS') this.#track(e);
        } catch { /* partial line */ }
      }
    }
  }

  #track(e) {
    const prev = this.backlog.get(e.backlogId);
    if (!prev || BACKLOG_ORDER[e.status] >= BACKLOG_ORDER[prev.status] || e.status === 'IN_PROGRESS') {
      this.backlog.set(e.backlogId, { status: e.status, title: e.title });
    }
  }

  /** Appends a body ({type, ...}) with the envelope added. Throws on invalid events. */
  append(body, { optional = false } = {}) {
    const event = { schemaVersion: 1, playerSessionId: this.playerSessionId, ...body };
    if (event.type === 'ORCHESTRATOR_STARTED') throw new Error('ORCHESTRATOR_STARTED is written by MTM Player');
    const reason = validateEvent(event);
    if (reason) throw new Error(`INVALID_PROGRESS_EVENT(${event.type}): ${reason}`);
    if (event.type === 'BACKLOG_STATUS') {
      const prev = this.backlog.get(event.backlogId);
      if (event.status === 'DISCOVERED' && prev) return { skipped: 'already-known' };
      if (prev && prev.status === 'SUBMITTED') return { skipped: 'already-submitted' };
    }
    const size = existsSync(this.file) ? statSync(this.file).size : 0;
    if (optional && size > SOFT_LIMIT && !MANDATORY.has(event.type)) return { skipped: 'log-budget' };
    const line = JSON.stringify(event) + '\n';
    this.queue.push(line);
    this.#flush();
    if (event.type === 'BACKLOG_STATUS') this.#track(event);
    return { appended: true, pending: this.queue.length };
  }

  #flush() {
    while (this.queue.length) {
      try { appendFileSync(this.file, this.queue[0], 'utf8'); this.queue.shift(); }
      catch { return; } // keep order; retried on the next append
    }
  }
}
