#!/usr/bin/env node
// ui-run: UI evidence from a JSON list of steps, with the failure modes of CVNXDTQY / T5QSM1E2 handled in code:
// sign-in that waits for the URL to leave the login page (not for "hydration"), clicks that fall back to force and
// then to neutralising the element that intercepts them (a layout bug owned by another item), downloads saved byte
// for byte under the exact MVS name, screenshots at the asked viewport once loading indicators are gone.
// The app is never modified: neutralising only adds a style to this browser session.
//
//   node ui-run.mjs --spec <file.json | inline JSON> [--app <app folder>] [--base http://localhost:3010]
//
// Spec: { base?, viewport?: [w,h], login?: { path?, user | userEnv, password | passwordEnv, envFile?, fresh? },
//         server?: { command, port, cwd? }, neutralize?: [selector], steps: [ ...actions ] }
// Actions (one key each, plus options):
//   { goto: "/accounting" }                     { tab: "Invoices" }            { press: "Enter" }
//   { click: "Export CSV" | {role,name} | {label} | {selector} | {text}, force?, nth? }
//   { fill: {label|placeholder|selector|name}, value: "24680" }
//   { select: {label|selector}, option: "Mekong Logistics MLD" }   (native <select> or a listbox/combobox)
//   { check: {label}, value?: true }            { waitFor: "Saved" | {text}|{selector}, timeout? }
//   { download: <click target>, saveAs: "answers/CR-01/evidence/tc-01-all-invoices.csv" }
//   { screenshot: "answers/BUG-02/evidence/tc-01-vnd-invoice.png", fullPage? }   { wait: 500 }
//   { neutralize: "nav[aria-label=Primary]" }   { viewport: [390, 844] }
// Output: one JSON line {ok, steps:[{i, action, ok, ms, note?, error?}], files:[...], blockedBy?:[...]}; exit 0/1.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadSpec(raw) {
  if (!raw) throw new Error('--spec <file.json | JSON> is required');
  const text = raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8');
  return JSON.parse(text.replace(/^﻿/, ''));
}

function appDir() {
  const given = arg('--app');
  if (given) return resolve(given);
  for (const d of [process.cwd(), join(process.cwd(), 'src')]) if (existsSync(join(d, 'package.json'))) return d;
  return process.cwd();
}

function loadPlaywright(app) {
  const req = createRequire(join(app, 'package.json'));
  for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
    try { const m = req(name); if (m.chromium) return m; } catch { /* next */ }
  }
  const self = createRequire(import.meta.url);
  for (const name of ['playwright', 'playwright-core']) { try { const m = self(name); if (m.chromium) return m; } catch { /* next */ } }
  throw new Error('Playwright is not installed in the app (pnpm exec playwright install chromium) nor next to ui-run');
}

async function launch(pw) {
  const errors = [];
  for (const opts of [{}, { channel: 'chromium' }, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await pw.chromium.launch({ headless: true, ...opts }); } catch (e) { errors.push(String(e.message).split('\n')[0]); }
  }
  throw new Error(`no browser could be launched: ${errors.join(' | ')}`);
}

function readEnv(file) {
  const out = {};
  if (!file || !existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function answers(url) {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status > 0; } catch { return false; }
}

async function ensureServer(server, base, app) {
  if (!server || await answers(base)) return null;
  // Not detached on Windows: a detached process without a console can exit at once (CVNXDTQY).
  const child = spawn(server.command, { cwd: server.cwd ? resolve(app, server.cwd) : app, shell: true, detached: process.platform !== 'win32', stdio: 'ignore', windowsHide: true });
  child.unref();
  const end = Date.now() + (server.timeoutMs ?? 180000);
  while (Date.now() < end) { if (await answers(base)) return `server started: ${server.command}`; await sleep(1500); }
  throw new Error(`server did not answer at ${base} within ${(server.timeoutMs ?? 180000) / 1000} s`);
}

// ---------- locating ----------
function byTarget(page, t, kinds = ['button', 'link', 'tab', 'menuitem', 'option']) {
  if (typeof t === 'string') {
    const cands = kinds.map(role => page.getByRole(role, { name: t, exact: true }));
    cands.push(page.getByText(t, { exact: true }));
    cands.push(page.getByRole('button', { name: t }));
    return cands;
  }
  if (t.selector) return [page.locator(t.selector)];
  if (t.role) return [page.getByRole(t.role, { name: t.name, exact: t.exact ?? true })];
  if (t.label) return [page.getByLabel(t.label, { exact: t.exact ?? true }), page.getByLabel(t.label)];
  if (t.placeholder) return [page.getByPlaceholder(t.placeholder)];
  if (t.name) return [page.locator(`[name="${t.name}"]`)];
  if (t.text) return [page.getByText(t.text, { exact: t.exact ?? false })];
  throw new Error(`cannot locate ${JSON.stringify(t)}`);
}

async function first(page, t, opts = {}) {
  const timeout = opts.timeout ?? 10000; const end = Date.now() + timeout;
  const cands = byTarget(page, t, opts.kinds);
  while (Date.now() < end) {
    for (const c of cands) {
      const loc = opts.nth != null ? c.nth(opts.nth) : c;
      try { const n = await loc.count(); if (n > 0) { const v = loc.first(); if (await v.isVisible()) return v; } } catch { /* next */ }
    }
    await sleep(200);
  }
  throw new Error(`not found or not visible within ${timeout} ms: ${JSON.stringify(t)}`);
}

/** Click with fallbacks. Covered (another element intercepts the pointer): neutralise that element for this session
 *  and click normally (a forced click would land on the cover). Other failures: force, then a DOM click. */
async function robustClick(page, loc, state) {
  try { await loc.click({ timeout: 4000 }); return null; } catch (e) {
    const msg = String(e.message);
    const m = msg.match(/<(\w+)([^>]*)>[^\n]*?(?:subtree )?intercepts pointer events/);
    if (m) {
      state.blockedBy.add(`<${m[1]}${m[2].slice(0, 120)}>`);
      const attrs = m[2]; const aria = attrs.match(/aria-label="([^"]+)"/); const id = attrs.match(/\sid="([^"]+)"/);
      const sel = id ? `#${id[1]}` : aria ? `${m[1]}[aria-label="${aria[1]}"]` : null;
      if (sel) {
        await neutralize(page, sel, state);
        try { await loc.click({ timeout: 3000 }); return `clicked after neutralising ${sel} (it covered the target)`; } catch { /* next */ }
      }
      await loc.evaluate(el => el.click());
      return 'clicked through the DOM (target covered)';
    }
    try { await loc.click({ timeout: 3000, force: true }); return 'clicked with force'; } catch { /* next */ }
    await loc.evaluate(el => el.click());
    return 'clicked through the DOM';
  }
}

async function neutralize(page, selector, state) {
  state.neutralized.add(selector);
  await page.addStyleTag({ content: `${selector}{pointer-events:none !important}` }).catch(() => {});
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    const busy = await page.locator('[aria-busy="true"], .animate-pulse, [data-loading="true"], [role="progressbar"]').filter({ visible: true }).count().catch(() => 0);
    if (!busy) break;
    await sleep(250);
  }
}

// ---------- login ----------
async function login(context, page, base, spec, app, authFile, notes) {
  const L = spec.login === true ? {} : spec.login;
  const env = readEnv(L.envFile ? resolve(app, L.envFile) : join(app, '.env'));
  const user = L.user ?? (L.userEnv ? env[L.userEnv] ?? process.env[L.userEnv] : undefined);
  const password = L.password ?? (L.passwordEnv ? env[L.passwordEnv] ?? process.env[L.passwordEnv] : undefined);
  const loginPath = L.path ?? '/login';
  const onLogin = () => /\/(login|signin|sign-in|auth)\b/i.test(new URL(page.url()).pathname);
  // Reuse a saved session when it still opens the app.
  if (!L.fresh && existsSync(authFile)) {
    await page.goto(base + (L.check ?? '/'), { waitUntil: 'domcontentloaded' });
    await settle(page);
    if (!onLogin()) { notes.push('session reused'); return; }
  }
  if (!user || !password) throw new Error('login needs user and password (or userEnv/passwordEnv present in the app .env)');
  await page.goto(base + loginPath, { waitUntil: 'domcontentloaded' });
  const pass = page.locator('input[type="password"]').first();
  await pass.waitFor({ state: 'visible', timeout: 20000 });
  let userBox = null;
  for (const c of [page.getByLabel(/user|email|login|account/i), page.locator('input[type="email"]'), page.locator('input[autocomplete="username"]'),
    page.locator('input[type="text"]'), page.locator('input:not([type])')]) {
    if (await c.count().catch(() => 0)) { const v = c.first(); if (await v.isVisible().catch(() => false)) { userBox = v; break; } }
  }
  if (!userBox) throw new Error('login page has no visible username/email input');
  // Type after the form is interactive: retry the fill until the value sticks (React re-renders can clear it).
  for (let attempt = 0; attempt < 5; attempt++) {
    await userBox.fill(user); await pass.fill(password);
    await sleep(300);
    if ((await userBox.inputValue()) === user && (await pass.inputValue()) === password) break;
  }
  await pass.press('Enter');
  const end = Date.now() + 30000;
  let clicked = false;
  while (Date.now() < end && onLogin()) {
    await sleep(500);
    if (!clicked && Date.now() > end - 25000) {
      clicked = true;
      const submit = page.locator('button[type="submit"], input[type="submit"]').first();
      if (await submit.count().catch(() => 0)) await submit.click({ timeout: 3000 }).catch(() => {});
    }
  }
  if (onLogin()) {
    const err = (await page.locator('[role="alert"], .error, [data-error]').first().textContent().catch(() => '')) ?? '';
    throw new Error(`still on the login page after 30 s${err ? `: ${err.trim().slice(0, 120)}` : ''}`);
  }
  await settle(page);
  mkdirSync(dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
  notes.push('signed in');
}

// ---------- main ----------
async function main() {
  const spec = loadSpec(arg('--spec'));
  const app = appDir();
  const base = (arg('--base') ?? spec.base ?? 'http://localhost:3000').replace(/\/$/, '');
  const rootFor = p => isAbsolute(p) ? p : resolve(arg('--out-root') ?? resolve(app, spec.outRoot ?? '..'), p);
  const authFile = resolve(app, '..', '.mtm-tmp', 'tools', `ui-auth-${new URL(base).port || '80'}.json`);
  const report = { ok: false, base, steps: [], files: [] };
  const state = { blockedBy: new Set(), neutralized: new Set() };
  const notes = [];
  let browser;
  try {
    const started = await ensureServer(spec.server, base, app);
    if (started) notes.push(started);
    const pw = loadPlaywright(app);
    browser = await launch(pw);
    const [w, h] = spec.viewport ?? [1440, 900];
    const context = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true,
      ...(existsSync(authFile) && spec.login && !(spec.login.fresh) ? { storageState: authFile } : {}) });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    if (spec.login) await login(context, page, base, spec, app, authFile, notes);
    for (const sel of spec.neutralize ?? []) await neutralize(page, sel, state);
    for (const [i, s] of (spec.steps ?? []).entries()) {
      const t0 = Date.now(); const action = Object.keys(s).find(k => !['force', 'nth', 'timeout', 'value', 'option', 'saveAs', 'fullPage', 'exact'].includes(k));
      const row = { i, action, ok: false };
      try {
        let note = null;
        if (action === 'goto') { await page.goto(base + s.goto, { waitUntil: 'domcontentloaded' }); for (const sel of state.neutralized) await neutralize(page, sel, state); await settle(page); }
        else if (action === 'tab') { note = await robustClick(page, await first(page, s.tab, { kinds: ['tab', 'link', 'button'] }), state); await settle(page); }
        else if (action === 'click') { const loc = await first(page, s.click, s); note = s.force ? (await loc.click({ force: true }), 'force') : await robustClick(page, loc, state); await settle(page); }
        else if (action === 'fill') { const loc = await first(page, s.fill, { kinds: ['textbox', 'spinbutton', 'searchbox'] }); await loc.fill(String(s.value)); }
        else if (action === 'press') { await page.keyboard.press(s.press); }
        else if (action === 'check') { const loc = await first(page, s.check, { kinds: ['checkbox', 'switch'] }); await loc.setChecked(s.value ?? true, { force: true }); }
        else if (action === 'select') {
          const loc = await first(page, s.select, { kinds: ['combobox', 'listbox'] });
          const tag = await loc.evaluate(el => el.tagName.toLowerCase());
          if (tag === 'select') await loc.selectOption({ label: s.option });
          else { note = await robustClick(page, loc, state); await robustClick(page, await first(page, { role: 'option', name: s.option }), state); }
          await settle(page);
        }
        else if (action === 'waitFor') {
          const tgt = typeof s.waitFor === 'string' ? { text: s.waitFor } : s.waitFor;
          await first(page, tgt, { timeout: s.timeout ?? 15000 });
        }
        else if (action === 'wait') { await sleep(Number(s.wait) || 500); }
        else if (action === 'neutralize') { await neutralize(page, s.neutralize, state); }
        else if (action === 'viewport') { await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] }); await settle(page); }
        else if (action === 'download') {
          if (!s.saveAs) throw new Error('download needs saveAs');
          const loc = await first(page, s.download, s);
          const [dl] = await Promise.all([page.waitForEvent('download', { timeout: s.timeout ?? 20000 }), robustClick(page, loc, state).then(n => { note = n; })]);
          const out = rootFor(s.saveAs); mkdirSync(dirname(out), { recursive: true });
          await dl.saveAs(out);
          report.files.push({ path: s.saveAs, bytes: statSync(out).size, suggested: dl.suggestedFilename() });
        }
        else if (action === 'screenshot') {
          await settle(page);
          const out = rootFor(s.screenshot); mkdirSync(dirname(out), { recursive: true });
          await page.screenshot({ path: out, fullPage: Boolean(s.fullPage) });
          const vp = page.viewportSize();
          report.files.push({ path: s.screenshot, bytes: statSync(out).size, viewport: vp ? `${vp.width}x${vp.height}` : null, url: page.url() });
        }
        else throw new Error(`unknown action ${JSON.stringify(s)}`);
        row.ok = true; if (note) row.note = note;
      } catch (e) {
        row.error = String(e.message).split('\n').slice(0, 2).join(' ').slice(0, 300);
        row.url = page.url();
        report.steps.push({ ...row, ms: Date.now() - t0 });
        const dbg = resolve(app, '..', '.mtm-tmp', 'tools', `ui-run-fail-${Date.now()}.png`);
        try { mkdirSync(dirname(dbg), { recursive: true }); await page.screenshot({ path: dbg }); report.failureScreenshot = dbg; } catch { /* ignore */ }
        throw Object.assign(new Error(`step ${i} (${action}) failed: ${row.error}`), { reported: true });
      }
      report.steps.push({ ...row, ms: Date.now() - t0 });
    }
    report.ok = true;
  } catch (e) {
    report.error = String(e.message).slice(0, 400);
  } finally {
    if (notes.length) report.notes = notes;
    if (state.blockedBy.size) report.blockedBy = [...state.blockedBy];
    if (state.neutralized.size) report.neutralized = [...state.neutralized];
    await browser?.close().catch(() => {});
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(report.ok ? 0 : 1);
}

main();
