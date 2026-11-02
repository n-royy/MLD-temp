// Mock Game Master for helper tests. Fictitious data only; loopback HTTP.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export function startMockGm({ matchId = 'ABCD1234', teamCode = 'MLD', apiKey = 'FAKE_TEAM_KEY_FOR_TESTS', user = 'mock-user', pass = 'mock-pass' } = {}) {
  const matchUuid = '11111111-1111-4111-8111-111111111111';
  const state = {
    status: 'IN_PROGRESS', sequence: 1, sessions: new Set(), started: new Set(), submissions: new Map(),
    failNextSubmit: 0, calls: [], logins: 0,
    backlog: [{ key: 'TASK-01', backlogType: 'TASK', title: 'Fix customer search', deadlineMinutes: null, revisionNo: 1,
      workStatus: 'NOT_STARTED', description: 'Customer search must ignore case.' }]
  };
  const projection = origin => ({
    match: { id: matchUuid, publicId: matchId, status: state.status, currentSequence: state.sequence, ...(state.clock ?? {}) },
    team: { code: teamCode, name: 'Megalodon' },
    backlog: state.backlog,
    api: { startEndpoint: `${origin}/api/v1/matches/${matchUuid}/backlogs/start`,
      submissionEndpoint: `${origin}/api/v1/matches/${matchUuid}/submissions`,
      feedEndpoint: `/api/v1/match/${matchId}/feed` }
  });
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': `req_${randomUUID().slice(0, 8)}`, ...headers });
    res.end(JSON.stringify(body));
  };
  const err = (res, status, code) => send(res, status, { error: { code, message: code, requestId: 'req_x', details: {} } });
  const cookieOk = req => [...state.sessions].some(s => (req.headers.cookie ?? '').includes(`gm_session=${s}`));
  const bearerOk = req => req.headers.authorization === `Bearer ${apiKey}`;

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('end', () => {
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      state.calls.push(`${req.method} ${url.pathname}`);
      let body = null;
      if (raw) { try { body = JSON.parse(raw); } catch { return err(res, 400, 'VALIDATION_ERROR'); } }
      if (req.method === 'POST' && url.pathname === '/api/v1/auth/login') {
        if (req.headers.origin !== origin) return err(res, 403, 'FORBIDDEN');
        if (body?.username !== user || body?.password !== pass) return err(res, 401, 'INVALID_CREDENTIALS');
        const sid = randomUUID();
        state.sessions.add(sid); state.logins++;
        return send(res, 200, { user: { role: 'CUDER' } }, { 'set-cookie': `gm_session=${sid}; Path=/; HttpOnly` });
      }
      if (req.method === 'GET' && url.pathname === `/api/v1/match/${matchId}`) {
        if (!cookieOk(req)) return err(res, 401, 'UNAUTHENTICATED');
        return send(res, 200, projection(origin));
      }
      if (req.method === 'GET' && url.pathname === `/api/v1/match/${matchId}/feed`) {
        if (!cookieOk(req)) return err(res, 401, 'UNAUTHENTICATED');
        const after = Number(url.searchParams.get('afterSequence'));
        return send(res, 200, { items: after < state.sequence ? [{ sequence: state.sequence }] : [] });
      }
      if (req.method === 'POST' && url.pathname === `/api/v1/matches/${matchUuid}/backlogs/start`) {
        if (!bearerOk(req)) return err(res, 401, 'INVALID_API_KEY');
        const item = state.backlog.find(i => i.key === body?.backlogItemKey);
        if (!item) return err(res, 404, 'BACKLOG_ITEM_NOT_FOUND');
        const replay = state.started.has(item.key);
        state.started.add(item.key);
        const template = { backlogId: item.key, status: 'DRAFT', changeSummary: '',
          testResults: [{ id: `${item.key}-TC-01`, result: 'NOT_RUN', evidence: [] }] };
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
          required: ['backlogId', 'status', 'changeSummary', 'testResults'],
          properties: {
            backlogId: { const: item.key }, status: { enum: ['DONE', 'PARTIAL', 'BLOCKED'] }, changeSummary: { type: 'string' },
            testResults: { type: 'array', minItems: 1, prefixItems: [{ $ref: '#/$defs/row' }], items: false }
          },
          $defs: {
            evidencePath: { type: 'string', pattern: '^evidence/[^/]+$' },
            row: { type: 'object', additionalProperties: false, required: ['id', 'result', 'evidence'],
              properties: { id: { const: `${item.key}-TC-01` }, result: { enum: ['PASS', 'FAIL', 'NOT_RUN'] },
                evidence: { type: 'array', uniqueItems: true, items: { $ref: '#/$defs/evidencePath' } }, note: { type: 'string' } },
              if: { properties: { result: { const: 'PASS' } } }, then: { properties: { evidence: { minItems: 1 } } } }
          }
        };
        return send(res, replay ? 200 : 201, { backlogId: item.key, backlogType: item.backlogType, startInstruction: '', replay,
          submitTemplate: template, minimumVerificationScenarios: item.backlogType === 'BUG' ? { scenarios: [{ id: 'MVS-1' }] } : null,
          files: { [`challenge/${item.key}-submit.json`]: JSON.stringify(template),
            [`challenge/${item.key}-submit.schema.json`]: JSON.stringify(schema) } });
      }
      if (req.method === 'POST' && url.pathname === `/api/v1/matches/${matchUuid}/submissions`) {
        if (!bearerOk(req)) return err(res, 401, 'INVALID_API_KEY');
        const key = req.headers['idempotency-key'];
        if (!key || !/^[A-Za-z0-9._~-]{8,128}$/.test(key)) return err(res, 422, 'VALIDATION_ERROR');
        if (!body?.gitRevision || !body?.answer || !body?.clientSubmissionId) return err(res, 422, 'VALIDATION_ERROR');
        if (!state.started.has(body.backlogItemKey)) return err(res, 409, 'BACKLOG_NOT_STARTED');
        if (state.failNextSubmit > 0) { state.failNextSubmit--; return err(res, 503, 'UNAVAILABLE'); }
        const prev = state.submissions.get(body.backlogItemKey);
        if (prev) {
          if (prev.key === key && prev.raw === raw) return send(res, 201, { submission: prev.receipt }, { 'idempotent-replay': 'true' });
          if (prev.key === key) return err(res, 409, 'IDEMPOTENCY_CONFLICT');
          return err(res, 409, 'ALREADY_SUBMITTED');
        }
        const receipt = { id: randomUUID(), matchId: matchUuid, teamId: randomUUID(), backlogItemKey: body.backlogItemKey,
          backlogRevisionNo: 1, attemptNo: 1, receivedAt: new Date().toISOString(), status: 'ACCEPTED', scoreStatus: 'PENDING' };
        state.submissions.set(body.backlogItemKey, { key, raw, receipt, body });
        return send(res, 201, { submission: receipt });
      }
      if (req.method === 'POST' && url.pathname === `/api/v1/mcp/${matchId}`) {
        if (!bearerOk(req)) return err(res, 401, 'INVALID_API_KEY');
        if (body?.method === 'initialize') return send(res, 200, { jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'company', version: '1' } } }, { 'mcp-session-id': 'mcp-1' });
        if (body?.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
        if (body?.method === 'tools/list') return send(res, 200, { jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'search_logs', description: 'Production logs', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }] } });
        if (body?.method === 'tools/call') {
          // SSE-shaped response to exercise the fallback parser.
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: `logs for ${body.params.arguments.query}` }] } })}\n\n`);
        }
        return send(res, 200, { jsonrpc: '2.0', id: body?.id, error: { code: -32601, message: 'nope' } });
      }
      if (url.pathname.includes('/rematch')) return err(res, 418, 'REMATCH_MUST_NOT_BE_CALLED');
      return err(res, 404, 'NOT_FOUND');
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    resolve({ origin, state, matchId, matchUuid, apiKey, user, pass, close: () => new Promise(r => server.close(r)),
      reveal(item) { state.backlog.push(item); state.sequence++; },
      expireSessions() { state.sessions.clear(); } });
  }));
}
