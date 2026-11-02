#!/usr/bin/env node
// Read-only checker. Without --team-workspace it checks the package; with it, it also checks
// the installed registrations, payload parity and the MCP handshake. Exits nonzero on failure.
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const check = (ok, code) => { if (!ok) problems.push(code); return ok; };
const read = p => readFileSync(p, 'utf8');
const json = p => { try { return JSON.parse(read(p)); } catch { problems.push(`INVALID_JSON:${p}`); return null; } };
const exactKeys = (v, keys) => v && JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...keys].sort());
const i = process.argv.indexOf('--team-workspace');
const ws = i > 0 ? resolve(process.argv[i + 1]) : null;

function filesBelow(root, entry) {
  const start = join(root, entry);
  if (!existsSync(start)) { problems.push(`MISSING:${entry}`); return []; }
  if (lstatSync(start).isFile()) return [entry];
  const out = [];
  const visit = (abs, rel) => {
    for (const n of readdirSync(abs).sort()) {
      const c = join(abs, n);
      const s = lstatSync(c);
      if (s.isSymbolicLink()) problems.push(`LINK:${rel}/${n}`);
      else if (s.isDirectory()) visit(c, `${rel}/${n}`); else out.push(`${rel}/${n}`);
    }
  };
  visit(start, entry.replace(/[\\/]$/, ''));
  return out;
}

// The package that is checked: the installed runtime when a workspace is given.
const root = ws ? join(ws, 'team-sdlc-pack', 'runtime') : packageRoot;
const pkg = json(join(root, 'package.json'));
const runtime = json(join(root, 'team-runtime.json'));
const info = json(join(root, 'team-pack-info.json'));
const ENTRIES = ['agents/', 'bin/', 'config/', 'contracts/', 'docs/', 'install.ps1', 'scripts/check-distribution.mjs',
  'scripts/install.mjs', 'skills/', 'src/', 'README.md', 'team-pack-info.json', 'team-runtime.json'];
check(pkg?.name === 'team-sdlc-pack', 'PACKAGE_NAME');
check(JSON.stringify(pkg?.files) === JSON.stringify(ENTRIES), 'PACKAGE_FILES_ORDER');
check(!pkg?.scripts || !['preinstall', 'install', 'postinstall', 'prepare'].some(k => pkg.scripts[k]), 'LIFECYCLE_SCRIPTS');
check(exactKeys(runtime, ['schemaVersion', 'kind', 'name', 'version', 'protocolVersion', 'provider', 'entrypoint']) &&
  runtime.kind === 'mtm-team-runtime' && runtime.name === 'team-sdlc-pack' && runtime.protocolVersion === 4 &&
  runtime.provider === 'codex' && exactKeys(runtime.entrypoint, ['rootAgentType']) &&
  runtime.entrypoint.rootAgentType === 'team_orchestrator', 'TEAM_RUNTIME_MANIFEST');
check(exactKeys(info, ['schemaVersion', 'version', 'teamId', 'teamName']) && info.schemaVersion === 1 &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(info?.teamId ?? '') && info.teamId !== 'YOUR_TEAM_ID', 'TEAM_PACK_INFO');
check(pkg?.version === runtime?.version && pkg?.version === info?.version, 'VERSION_MISMATCH');
const files = pkg ? ['package.json', ...(pkg.files ?? []).flatMap(e => filesBelow(root, e))] : [];
for (const f of ['skills/team-orchestrator/WORKER.md', 'skills/game-preparation/ENVIRONMENT.md']) check(existsSync(join(root, f)), `MISSING:${f}`);
for (const [skill] of [['team-orchestrator'], ['game-preparation'], ['team-recovery']]) {
  const p = join(root, 'skills', skill, 'SKILL.md');
  check(existsSync(p) && read(p).trim().length > 200, `SKILL_EMPTY:${skill}`);
}
for (const f of ['bin/runtime-server.mjs', 'src/runtime-session.mjs', 'scripts/install.mjs', 'install.ps1', 'config/codex.toml']) {
  check(existsSync(join(root, f)) && read(join(root, f)).trim().length > 0, `EMPTY:${f}`);
}
check(/^name\s*=\s*"team_orchestrator"\s*$/m.test(existsSync(join(root, 'agents/team-orchestrator.toml')) ? read(join(root, 'agents/team-orchestrator.toml')) : ''), 'ORCHESTRATOR_PROFILE');
for (const n of existsSync(join(root, 'agents')) ? readdirSync(join(root, 'agents')) : []) {
  const name = read(join(root, 'agents', n)).match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  check(name === n.replace(/\.toml$/, '').replace(/-/g, '_'), `PROFILE_NAME:${n}`);
}
// Codex >= 0.164 ignores the whole config when an [mcp_servers.x] table has no command/url ("invalid transport").
{
  const cfgText = existsSync(join(root, 'config', 'codex.toml')) ? read(join(root, 'config', 'codex.toml')) : '';
  for (const block of cfgText.split(/^(?=\[)/m).filter(b => /^\[mcp_servers\.[^\]]+\]/.test(b))) {
    check(/^\s*(command|url)\s*=/m.test(block), `MCP_SERVER_WITHOUT_TRANSPORT:${block.match(/^\[([^\]]+)\]/)[1]}`);
  }
}
const schema = json(join(root, 'contracts', 'progress-event.schema.json'));
check(Array.isArray(schema?.oneOf), 'PROGRESS_SCHEMA');

if (ws) {
  const same = (a, b, code) => check(existsSync(a) && existsSync(b) && read(a) === read(b), code);
  same(join(root, 'team-runtime.json'), join(ws, '.mtm', 'team-runtime.json'), 'REGISTRATION_RUNTIME');
  same(join(root, 'team-pack-info.json'), join(ws, '.mtm', 'team-pack-info.json'), 'REGISTRATION_IDENTITY');
  for (const n of readdirSync(join(root, 'agents'))) same(join(root, 'agents', n), join(ws, '.codex', 'agents', n), `REGISTRATION_AGENT:${n}`);
  // Every skill file (SKILL.md plus WORKER.md, ENVIRONMENT.md, LESSONS.md, products/...) must be registered.
  for (const f of files.filter(f => f.startsWith('skills/'))) same(join(root, f), join(ws, '.agents', f), `REGISTRATION_SKILL:${f}`);
  const server = join(root, 'bin', 'runtime-server.mjs').replace(/\\/g, '/');
  const cfg = existsSync(join(ws, '.codex', 'config.toml')) ? read(join(ws, '.codex', 'config.toml')) : '';
  check(cfg.includes(JSON.stringify(server)), 'CODEX_CONFIG_MCP_PATH');
  const source = existsSync(join(packageRoot, 'package.json')) && packageRoot !== root ? packageRoot : null;
  if (source) for (const f of files) {
    if (existsSync(join(source, f))) check(read(join(source, f)) === read(join(root, f)), `PAYLOAD_DIFFERS:${f}`);
  }
  check(existsSync(join(ws, 'matches')) && existsSync(join(ws, 'team-sdlc-pack', 'logs')), 'WORKSPACE_LAYOUT');
}

// MCP handshake: initialize + tools/list against the checked runtime.
const handshake = () => new Promise(resolveHs => {
  const child = spawn(process.execPath, [join(root, 'bin', 'runtime-server.mjs')], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  let buf = '';
  const timer = setTimeout(() => { child.kill(); resolveHs(null); }, 10000);
  child.stdout.on('data', d => {
    buf += d;
    const lines = buf.split('\n');
    for (const l of lines) {
      try {
        const m = JSON.parse(l);
        if (m.id === 2) { clearTimeout(timer); child.kill(); resolveHs(m.result?.tools?.map(t => t.name) ?? null); }
      } catch { /* partial */ }
    }
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'checker', version: '1' } } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
});
const tools = await handshake();
check(Array.isArray(tools) && ['configure_session', 'refresh_match', 'start_work', 'submit_work', 'report_progress', 'wait_for_update', 'prepare_slots', 'integrate_item', 'apply_baseline', 'start_jobs', 'wait_jobs']
  .every(t => tools.includes(t)), 'MCP_HANDSHAKE');

const result = problems.length ? { status: 'FAILED', problems } :
  { status: 'READY', version: pkg.version, teamId: info.teamId, teamName: info.teamName, files: files.length, tools };
console.log(JSON.stringify(result));
process.exit(problems.length ? 1 : 0);
