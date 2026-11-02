// Loopback relay that lets worker subagents use the match's Company Tools without ever holding the team API key.
// Each Codex subagent starts its own MCP helper process, which is never configured (NOT_CONFIGURED in 7GAZA14X), so
// workers could not read the knowledge base or logs their items depend on. The orchestrator's helper (the only
// process holding the key, in memory) serves company tool calls on 127.0.0.1 behind a random per-process token; the
// token and port are written only into git-ignored .mtm-tmp/ files of the match and its slots.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BODY = 64 * 1024;
export const PROXY_FILE = 'company-proxy.json';

export function startCompanyProxy(session) {
  const token = randomBytes(24).toString('hex');
  const server = createServer((req, res) => {
    let raw = ''; let size = 0;
    req.on('data', d => { size += d.length; if (size > MAX_BODY) req.destroy(); else raw += d; });
    req.on('end', async () => {
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.method !== 'POST' || req.url !== '/company') return send(404, { error: { code: 'NOT_FOUND' } });
      let body; try { body = JSON.parse(raw); } catch { return send(400, { error: { code: 'BAD_JSON' } }); }
      const a = Buffer.from(String(body?.token ?? '')); const b = Buffer.from(token);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return send(403, { error: { code: 'PROXY_TOKEN_REJECTED' } });
      try {
        if (body.op === 'list') return send(200, { result: await session.companyTools() });
        if (body.op === 'call') return send(200, { result: await session.companyCall({ name: body.name, arguments: body.arguments ?? {}, backlogId: body.backlogId ?? null }) });
        return send(400, { error: { code: 'BAD_OP' } });
      } catch (error) {
        return send(200, { error: { code: error.code ?? 'COMPANY_TOOL_FAILED', message: String(error.message ?? error).slice(0, 500) } });
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.unref(); resolve({ port: server.address().port, token, close: () => server.close() }); });
  });
}

/** Worker side: relay one call through the orchestrator helper named by <slotMatchRoot>/.mtm-tmp/company-proxy.json. */
export async function relayCompany(slotMatchRoot, payload) {
  let info;
  try { info = JSON.parse(readFileSync(join(slotMatchRoot, '.mtm-tmp', PROXY_FILE), 'utf8')); }
  catch { throw Object.assign(new Error(`no ${PROXY_FILE} under ${slotMatchRoot}/.mtm-tmp; ask the orchestrator`), { code: 'PROXY_UNAVAILABLE' }); }
  if (!Number.isInteger(info?.port) || info.port < 1 || info.port > 65535 || typeof info.token !== 'string') {
    throw Object.assign(new Error('invalid proxy file'), { code: 'PROXY_UNAVAILABLE' });
  }
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${info.port}/company`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, token: info.token }), signal: AbortSignal.timeout(90000) });
  } catch (error) { throw Object.assign(new Error(`orchestrator helper not reachable: ${error.message}`), { code: 'PROXY_UNREACHABLE' }); }
  const body = await res.json().catch(() => null);
  if (!body) throw Object.assign(new Error(`proxy HTTP ${res.status}`), { code: 'PROXY_BAD_RESPONSE' });
  if (body.error) throw Object.assign(new Error(body.error.message ?? body.error.code), { code: body.error.code });
  return body.result;
}
