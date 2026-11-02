// 1.6.1: ui-run against a fake app with the T5QSM1E2 / CVNXDTQY failure modes: a login form that only works after
// hydration, a fixed sidebar covering the Export button, a native company select, a CSV download (BOM, quotes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let havePw = false; try { createRequire(import.meta.url)('playwright'); havePw = true; } catch { /* skip */ }
const CSV = { all: '﻿invoice_number,company\r\nINV-1,"Hoa Sen, ""HS"""\r\nINV-2,Cedar\r\n', 'Hoa Sen': '﻿invoice_number,company\r\nINV-1,"Hoa Sen, ""HS"""\r\n' };

function app() {
  return new Promise(res => {
    const server = createServer((req, r) => {
      const u = new URL(req.url, 'http://x'); const authed = (req.headers.cookie ?? '').includes('sid=ok');
      if (u.pathname === '/login') {
        r.writeHead(200, { 'content-type': 'text/html' });
        return r.end(`<!doctype html><html><body><main id="m">Loading…</main><script>
setTimeout(() => { document.getElementById('m').innerHTML = '<form id="f"><label for="u">Username or email</label><input id="u" type="text"><label for="p">Password</label><input id="p" type="password"><button type="submit">Sign in</button></form>';
  document.getElementById('f').addEventListener('submit', async e => { e.preventDefault();
    const ok = document.getElementById('u').value === 'admin' && document.getElementById('p').value === 'pw';
    if (!ok) return; document.cookie = 'sid=ok; path=/'; setTimeout(() => location.href = '/accounting', 400); }); }, 900);
</script></body></html>`);
      }
      if (!authed) { r.writeHead(302, { location: '/login' }); return r.end(); }
      if (u.pathname === '/export.csv') {
        const c = u.searchParams.get('company') || 'all';
        r.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="invoices.csv"' });
        return r.end(CSV[c] ?? CSV.all);
      }
      if (u.pathname === '/' || u.pathname === '/accounting') {
        r.writeHead(200, { 'content-type': 'text/html' });
        return r.end(`<!doctype html><html><body style="margin:0">
<nav aria-label="Primary" style="position:fixed;inset:0 auto 0 0;width:320px;background:#ccc;z-index:300">Sidebar</nav>
<div style="padding:20px 0 0 40px"><div role="tablist"><button role="tab" id="t1">Reports</button><button role="tab" id="t2" onclick="document.getElementById('inv').hidden=false">Invoices</button></div>
<section id="inv" hidden><label for="co">Company</label><select id="co"><option value="all">All companies</option><option>Hoa Sen</option><option>Cedar</option></select>
<a id="ex" style="display:inline-block;margin-left:10px" href="/export.csv" onclick="this.href='/export.csv?company='+encodeURIComponent(document.getElementById('co').value)">Export CSV</a>
<button>New invoice</button><div aria-busy="true" id="busy">loading</div></section></div>
<script>setTimeout(() => document.getElementById('busy').remove(), 1200)</script></body></html>`);
      }
      r.writeHead(404); r.end();
    });
    server.listen(0, '127.0.0.1', () => res(server));
  });
}

test('ui-run: login after hydration, covered button, select, exact download, screenshot', { skip: !havePw && 'playwright not installed', timeout: 120000 }, async () => {
  const server = await app(); const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = mkdtempSync(join(tmpdir(), 'mld-uirun-')); const matchRoot = join(tmp, 'M'); const appDir = join(matchRoot, 'src');
  mkdirSync(appDir, { recursive: true }); writeFileSync(join(appDir, 'package.json'), '{"name":"fake"}');
  writeFileSync(join(appDir, '.env'), 'ADMIN_USER=admin\nADMIN_PASSWORD="pw"\n');
  try {
    const spec = { base, viewport: [1440, 900], login: { userEnv: 'ADMIN_USER', passwordEnv: 'ADMIN_PASSWORD' }, steps: [
      { goto: '/accounting' }, { tab: 'Invoices' }, { select: { label: 'Company' }, option: 'Hoa Sen' },
      { download: 'Export CSV', saveAs: 'answers/CR-01/evidence/tc-02-filtered-invoices.csv' },
      { screenshot: 'answers/CR-01/evidence/tc-02-filtered-invoices.png' }] };
    // Async spawn: the fake app runs in this process, so the event loop must stay free.
    const run = () => new Promise(res => { const c = spawn(process.execPath, [join(packRoot, 'src', 'ui-run.mjs'), '--spec', JSON.stringify(spec), '--app', appDir]);
      let stdout = '', stderr = ''; c.stdout.on('data', d => { stdout += d; }); c.stderr.on('data', d => { stderr += d; }); c.on('close', () => res({ stdout, stderr })); });
    const r = await run();
    const rep = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(rep.ok, true, r.stdout + r.stderr);
    assert.deepEqual(rep.notes, ['signed in']);
    const csv = readFileSync(join(matchRoot, 'answers', 'CR-01', 'evidence', 'tc-02-filtered-invoices.csv'), 'utf8');
    assert.equal(csv, CSV['Hoa Sen'], 'downloaded byte for byte (BOM, quotes, CRLF)');
    assert.ok(rep.blockedBy?.some(b => b.includes('aria-label="Primary"')), JSON.stringify(rep));
    assert.match(rep.steps.find(s => s.action === 'tab').note, /neutralising nav\[aria-label="Primary"\]/, 'the covered tab was reached by neutralising the sidebar');
    assert.deepEqual(rep.neutralized, ['nav[aria-label="Primary"]']);
    const shot = rep.files.find(f => f.path.endsWith('.png'));
    assert.equal(shot.viewport, '1440x900'); assert.ok(shot.bytes > 1000);
    // Second run reuses the saved session.
    const r2 = JSON.parse((await run()).stdout.trim().split('\n').pop());
    assert.equal(r2.ok, true); assert.deepEqual(r2.notes, ['session reused']);
    // A failing step reports which step and leaves a failure screenshot.
    spec.steps = [{ goto: '/accounting' }, { click: 'No such button', timeout: 1500 }];
    const r3 = JSON.parse((await run()).stdout.trim().split('\n').pop());
    assert.equal(r3.ok, false); assert.match(r3.error, /step 1 \(click\) failed/); assert.ok(existsSync(r3.failureScreenshot));
  } finally { server.close(); rmSync(tmp, { recursive: true, force: true }); }
});
