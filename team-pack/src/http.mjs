// Bounded HTTPS client: allowlisted origins only, no redirects, size and time limits.
const MAX_BYTES = 2 * 1024 * 1024;

export class HttpError extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; Object.assign(this, detail); }
}

export function assertAllowed(url, allowedOrigins, { allowLoopback = false } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new HttpError('INVALID_URL'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(allowLoopback && loopback && u.protocol === 'http:')) throw new HttpError('ORIGIN_NOT_ALLOWED');
  if (u.username || u.password) throw new HttpError('ORIGIN_NOT_ALLOWED');
  if (!allowedOrigins.includes(u.origin)) throw new HttpError('ORIGIN_NOT_ALLOWED');
  return u;
}

/** Returns {status, headers, text, json}; never follows redirects. */
export async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 30000, allowedOrigins, allowLoopback } = {}) {
  const u = assertAllowed(url, allowedOrigins, { allowLoopback });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(u, { method, headers, body, redirect: 'manual', cache: 'no-store', signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    throw new HttpError(error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', { cause: error?.cause?.code ?? error?.message });
  }
  try {
    const reader = res.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { controller.abort(); throw new HttpError('RESPONSE_TOO_LARGE'); }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
    let json = null;
    if (/json/i.test(res.headers.get('content-type') ?? '')) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: res.status, headers: res.headers, text, json };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}

/** Collects name=value pairs from Set-Cookie headers into a Cookie header value. */
export function mergeCookies(jar, headers) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  for (const raw of list) {
    const [pair, ...attrs] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some(a => /^\s*max-age\s*=\s*0\s*$/i.test(a)) || value === '';
    if (expired) jar.delete(name); else jar.set(name, value);
  }
  return jar;
}

export const cookieHeader = jar => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
