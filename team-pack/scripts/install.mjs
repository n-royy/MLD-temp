#!/usr/bin/env node
// Installs this pack into a team workspace (idempotent). Usage:
//   node scripts/install.mjs --team-workspace "D:\mtm\MLD"
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (code, detail = '') => { console.error(JSON.stringify({ status: 'FAILED', code, detail })); process.exit(1); };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const exactKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...keys].sort());
const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { fail('INVALID_JSON', relative(packageRoot, p)); } };

function noLinks(path) {
  // Reject symlinks/junctions anywhere on the existing part of the path.
  let cursor = resolve(path);
  for (;;) {
    if (existsSync(cursor)) {
      if (lstatSync(cursor).isSymbolicLink()) fail('UNSAFE_TEAM_WORKSPACE', cursor);
      if (realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) fail('UNSAFE_TEAM_WORKSPACE', cursor);
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function filesBelow(root, entry) {
  const start = join(root, entry);
  if (!existsSync(start)) fail('MISSING_PACKAGE_FILE', entry);
  const st = lstatSync(start);
  if (st.isSymbolicLink()) fail('LINK_IN_PACKAGE', entry);
  if (st.isFile()) return [entry.replace(/\\/g, '/')];
  const out = [];
  const visit = (abs, rel) => {
    for (const name of readdirSync(abs).sort()) {
      const child = join(abs, name);
      const r = `${rel}/${name}`;
      const s = lstatSync(child);
      if (s.isSymbolicLink()) fail('LINK_IN_PACKAGE', r);
      if (s.isDirectory()) visit(child, r); else if (s.isFile()) out.push(r); else fail('UNSUPPORTED_FILE', r);
    }
  };
  visit(start, entry.replace(/[\\/]$/, ''));
  return out;
}

// ---- verify the package ----
const pkg = readJson(join(packageRoot, 'package.json'));
const runtime = readJson(join(packageRoot, 'team-runtime.json'));
const info = readJson(join(packageRoot, 'team-pack-info.json'));
if (pkg.name !== 'team-sdlc-pack' || !/^\d+\.\d+\.\d+$/.test(pkg.version) || !Array.isArray(pkg.files)) fail('INVALID_PACKAGE_JSON');
for (const k of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
  if (pkg[k] && Object.keys(pkg[k]).length) fail('DEPENDENCIES_NOT_ALLOWED', k);
}
if (!exactKeys(runtime, ['schemaVersion', 'kind', 'name', 'version', 'protocolVersion', 'provider', 'entrypoint']) ||
  runtime.schemaVersion !== 1 || runtime.kind !== 'mtm-team-runtime' || runtime.name !== 'team-sdlc-pack' ||
  runtime.protocolVersion !== 4 || runtime.provider !== 'codex' || !exactKeys(runtime.entrypoint, ['rootAgentType']) ||
  runtime.entrypoint.rootAgentType !== 'team_orchestrator') fail('INVALID_TEAM_RUNTIME');
if (!exactKeys(info, ['schemaVersion', 'version', 'teamId', 'teamName']) || info.schemaVersion !== 1 ||
  !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(info.teamId) || typeof info.teamName !== 'string' ||
  info.teamName.trim() !== info.teamName || !info.teamName || info.teamName.length > 160 || /[\0\r\n]/.test(info.teamName)) fail('INVALID_TEAM_PACK_INFO');
if (pkg.version !== runtime.version || pkg.version !== info.version) fail('VERSION_MISMATCH');
const orchestrator = readFileSync(join(packageRoot, 'agents', 'team-orchestrator.toml'), 'utf8');
if (!/^name\s*=\s*"team_orchestrator"\s*$/m.test(orchestrator)) fail('ORCHESTRATOR_PROFILE_NAME');
const files = ['package.json', ...pkg.files.flatMap(e => filesBelow(packageRoot, e))];

// ---- resolve the workspace ----
const wsArg = arg('--team-workspace');
if (!wsArg || !isAbsolute(wsArg)) fail('TEAM_WORKSPACE_MUST_BE_ABSOLUTE');
const ws = resolve(wsArg);
noLinks(ws);
mkdirSync(ws, { recursive: true });
if (!statSync(ws).isDirectory()) fail('TEAM_WORKSPACE_NOT_DIRECTORY');
const packWs = join(ws, 'team-sdlc-pack');
const runtimeDir = join(packWs, 'runtime');
for (const d of [join(ws, 'matches'), packWs, join(packWs, 'logs'), join(ws, '.mtm'), join(ws, '.codex', 'agents'), join(ws, '.agents', 'skills')]) {
  noLinks(d);
  mkdirSync(d, { recursive: true });
}

// ---- runtime payload (pack-owned; replaced as a whole) ----
if (existsSync(runtimeDir)) rmSync(runtimeDir, { recursive: true, force: true });
for (const f of files) {
  const target = join(runtimeDir, f);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(packageRoot, f), target);
}

// ---- registrations (byte-identical copies) ----
const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, readFileSync(join(runtimeDir, from))); };
copy('team-runtime.json', join(ws, '.mtm', 'team-runtime.json'));
copy('team-pack-info.json', join(ws, '.mtm', 'team-pack-info.json'));
const agentFiles = readdirSync(join(runtimeDir, 'agents')).filter(n => n.endsWith('.toml'));
for (const n of agentFiles) copy(`agents/${n}`, join(ws, '.codex', 'agents', n));
for (const skill of readdirSync(join(runtimeDir, 'skills'))) {
  const dest = join(ws, '.agents', 'skills', skill);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(join(runtimeDir, 'skills', skill), dest, { recursive: true });
}

// ---- Codex config: expand the MCP helper path to an absolute forward-slash path ----
const serverPath = join(runtimeDir, 'bin', 'runtime-server.mjs').replace(/\\/g, '/');
const template = readFileSync(join(runtimeDir, 'config', 'codex.toml'), 'utf8');
const expanded = template.replace('"../team-sdlc-pack/runtime/bin/runtime-server.mjs"', JSON.stringify(serverPath));
if (expanded === template) fail('CONFIG_TEMPLATE_UNEXPECTED');
writeFileSync(join(ws, '.codex', 'config.toml'), expanded);

// ---- install receipt (outside the runtime payload) ----
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const receipt = { schemaVersion: 1, name: pkg.name, version: pkg.version, teamId: info.teamId, teamName: info.teamName,
  installedAt: new Date().toISOString(), files: Object.fromEntries(files.map(f => [f, sha(join(runtimeDir, f))])) };
writeFileSync(join(packWs, 'install-receipt.json'), JSON.stringify(receipt, null, 2));

console.log(JSON.stringify({ status: 'READY', name: pkg.name, version: pkg.version, teamId: info.teamId, teamName: info.teamName,
  teamWorkspace: ws, runtime: runtimeDir, files: files.length, agents: agentFiles }));
