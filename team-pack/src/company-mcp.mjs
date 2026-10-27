// Client for the match's "Company Tools" MCP server (Streamable HTTP, JSON-RPC 2.0),
// at {gameMaster}/api/v1/mcp/{matchId}, authenticated with the team bearer key.
import { request, HttpError } from './http.mjs';

function parseBody(res) {
  if (res.json) return res.json;
  // SSE fallback: take the last JSON-RPC message from "data:" lines.
  const messages = res.text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
    .map(d => { try { return JSON.parse(d); } catch { return null; } }).filter(Boolean);
  return messages.at(-1) ?? null;
}

export class CompanyMcp {
  constructor({ url, apiKey, allowedOrigins, allowLoopback = false }) {
    Object.assign(this, { url, apiKey, allowedOrigins, allowLoopback });
    this.sessionId = null;
    this.nextId = 1;
    this.initialized = false;
    this.tools = null;
  }

  async #rpc(method, params, { notification = false } = {}) {
    const headers = { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json',
      accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const body = notification ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: this.nextId++, method, params };
    const res = await request(this.url, { method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 60000,
      allowedOrigins: this.allowedOrigins, allowLoopback: this.allowLoopback });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (notification) return null;
    if (res.status === 401 || res.status === 403) throw new HttpError('COMPANY_MCP_AUTH_REJECTED', { status: res.status });
    if (res.status === 404) throw new HttpError('COMPANY_MCP_NOT_FOUND', { status: res.status });
    if (res.status === 429) throw new HttpError('RATE_LIMITED', { status: res.status });
    const msg = parseBody(res);
    if (!msg) throw new HttpError('COMPANY_MCP_BAD_RESPONSE', { status: res.status });
    if (msg.error) throw new HttpError('COMPANY_MCP_ERROR', { status: res.status, rpcError: msg.error });
    return { result: msg.result, status: res.status, requestId: res.headers.get('x-request-id') };
  }

  async init() {
    if (this.initialized) return;
    await this.#rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'mld-team-helper', version: '1.0.0' } });
    await this.#rpc('notifications/initialized', {}, { notification: true });
    this.initialized = true;
  }

  async listTools() {
    await this.init();
    const out = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const { result } = await this.#rpc('tools/list', cursor ? { cursor } : {});
      out.push(...(result?.tools ?? []));
      cursor = result?.nextCursor;
      if (!cursor) break;
    }
    this.tools = out;
    return out;
  }

  async callTool(name, args = {}) {
    await this.init();
    try {
      return await this.#rpc('tools/call', { name, arguments: args });
    } catch (error) {
      // An expired MCP session is re-established once.
      if (error.code === 'COMPANY_MCP_ERROR' || error.status === 400) {
        this.initialized = false; this.sessionId = null;
        await this.init();
        return this.#rpc('tools/call', { name, arguments: args });
      }
      throw error;
    }
  }
}
