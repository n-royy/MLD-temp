#!/usr/bin/env node
// Collects every backlog item, Company Tool output ("issues") and seed codebase from the matches in the given
// team workspaces into one content-addressed dataset folder. Re-running only adds what is new.
// Usage: node collect-dataset.mjs <datasetDir> <teamWorkspace> [<teamWorkspace> ...]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const [out, ...workspaces] = process.argv.slice(2);
if (!out || !workspaces.length) { console.error('usage: collect-dataset.mjs <datasetDir> <teamWorkspace>...'); process.exit(2); }

const sha = data => createHash('sha256').update(data).digest('hex');
const git = (cwd, args, opts = {}) => execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 1 << 30, ...opts });
const readJson = f => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
const write = (f, data) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); };
const filesBelow = root => existsSync(root) ? readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(e => e.isFile()).map(e => join(e.parentPath ?? e.path, e.name)) : [];
// Stable JSON so the same content always hashes the same, whatever the key order.
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);

const indexFile = join(out, 'index.json');
const index = existsSync(indexFile) ? readJson(indexFile) : { schemaVersion: 1, matches: {}, codebases: {}, items: {}, issues: {} };
const gaps = [];

for (const ws of workspaces) {
  const matchesDir = join(ws, 'matches');
  for (const id of readdirSync(matchesDir)) {
    const checkout = join(matchesDir, id);
    if (!/^[A-Z0-9]{8}$/.test(id) || !existsSync(join(checkout, '.git')) || !existsSync(join(checkout, id))) continue;
    const mtm = join(checkout, '.git', 'mtm');

    // Codebase: the match folder as the organizer issued it (the commit that added it), keyed by its Git tree.
    const base = git(checkout, ['log', '--diff-filter=A', '--format=%H', '--', `${id}/README.md`]).toString().trim().split('\n').pop();
    const tree = git(checkout, ['rev-parse', `${base}:${id}`]).toString().trim();
    const codeKey = tree.slice(0, 12);
    const codeDir = join(out, 'codebases', codeKey);
    if (!existsSync(codeDir)) {
      mkdirSync(codeDir, { recursive: true });
      const tar = join(out, `.tmp-${codeKey}.tar`);
      git(checkout, ['archive', '--format=tar', '-o', tar, tree]);
      // Windows' own bsdtar: GNU tar from Git Bash reads "D:" as a remote host.
      execFileSync(process.platform === 'win32' ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar', ['-xf', tar, '-C', codeDir]);
      rmSync(tar);
    }
    const cb = index.codebases[codeKey] ??= { tree, files: filesBelow(codeDir).length, matches: [] };
    if (!cb.matches.includes(id)) cb.matches.push(id);

    // Full briefs live in the slots (multi-agent pack); start files in .git/mtm (both packs).
    const briefs = {};
    for (const b of [join(checkout, id, '.mtm-tmp'), ...filesBelow(`${checkout}.slots`).filter(f => f.endsWith('brief.json')).map(f => dirname(dirname(f)))]) {
      for (const f of filesBelow(b).filter(f => basename(f) === 'brief.json')) {
        try { const v = readJson(f); if (v.backlogId && v.item?.descriptionMd) briefs[v.backlogId] = { brief: v, dir: dirname(f) }; } catch { /* not a brief */ }
      }
    }
    const started = existsSync(mtm) ? readdirSync(mtm).filter(n => n.endsWith('.start.json')).map(n => n.slice(0, -'.start.json'.length)) : [];
    const progress = join(ws, 'team-sdlc-pack', 'logs', `${id}.progress.ndjson`);
    const discovered = existsSync(progress) ? [...new Set(readFileSync(progress, 'utf8').split('\n')
      .filter(l => l.includes('"DISCOVERED"')).map(l => { try { return JSON.parse(l).backlogId; } catch { return null; } }).filter(Boolean))] : [];

    const match = index.matches[id] = { workspace: ws, codebase: codeKey, baseCommit: base, items: {} };
    for (const key of [...new Set([...discovered, ...started])].sort()) {
      const startFile = join(mtm, `${key}.start.json`);
      if (!existsSync(startFile)) { match.items[key] = null; gaps.push(`${id} ${key}: discovered, never started (no brief issued)`); continue; }
      const start = readJson(startFile);
      const organizer = Object.fromEntries(filesBelow(join(mtm, key, 'files')).map(f =>
        [relative(join(mtm, key, 'files'), f).replaceAll('\\', '/'), sha(readFileSync(f))]).sort());
      // An item variant = what the organizer issued for it: instruction, template, MVS and organizer files.
      const variant = sha(stable({ key, startInstruction: start.startInstruction, submitTemplate: start.submitTemplate,
        mvs: start.minimumVerificationScenarios ?? null, organizer })).slice(0, 12);
      const itemDir = join(out, 'backlog', `${key}__${variant}`);
      if (!existsSync(itemDir)) {
        write(join(itemDir, 'start.json'), JSON.stringify({ backlogId: key, backlogType: start.backlogType,
          startInstruction: start.startInstruction, submitTemplate: start.submitTemplate,
          minimumVerificationScenarios: start.minimumVerificationScenarios ?? null }, null, 2));
        if (existsSync(join(mtm, key, 'files'))) cpSync(join(mtm, key, 'files'), join(itemDir, 'files'), { recursive: true });
      }
      const item = index.items[`${key}__${variant}`] ??= { key, type: start.backlogType, descriptions: {}, matches: [] };
      if (!item.matches.includes(id)) item.matches.push(id);
      const b = briefs[key];
      if (b) {
        const it = b.brief.item;
        const md = it.descriptionMd.split(id).join('<MATCH_ID>');
        const dKey = sha(md).slice(0, 12);
        if (!item.descriptions[dKey]) {
          write(join(itemDir, `description__${dKey}.md`), md);
          write(join(itemDir, `meta__${dKey}.json`), JSON.stringify({ key, title: it.title, type: it.type, points: it.points,
            deadlineMinutes: it.deadlineMinutes ?? null, releaseFiles: it.releaseFiles, onStartFiles: it.onStartFiles }, null, 2));
          item.descriptions[dKey] = [];
        }
        if (!item.descriptions[dKey].includes(id)) item.descriptions[dKey].push(id);
        // Issues: Company Tool answers saved next to the brief, keyed by content.
        for (const f of readdirSync(b.dir).filter(n => /^company-.+\.txt$/.test(n))) {
          const tool = f.replace(/^company-/, '').replace(/-\d+\.txt$/, '');
          // The organizer stamps the match ID into otherwise identical answers (fixture IDs, descriptions).
          const data = readFileSync(join(b.dir, f), 'utf8').split(id).join('<MATCH_ID>').split(id.toLowerCase()).join('<match_id>');
          const iKey = `${key}/${tool}__${sha(data).slice(0, 12)}`;
          if (!index.issues[iKey]) { write(join(out, 'issues', `${iKey}.txt`), data); index.issues[iKey] = { key, tool, matches: [] }; }
          if (!index.issues[iKey].matches.includes(id)) index.issues[iKey].matches.push(id);
        }
      }
      match.items[key] = `${key}__${variant}`;
    }
  }
}

// Coverage: every item variant needs a description and at least one issue file.
for (const [k, v] of Object.entries(index.items)) {
  if (!Object.keys(v.descriptions).length) gaps.push(`${k}: no description saved in any match`);
  if (v.type !== 'TASK' && !Object.values(index.issues).some(i => i.key === v.key)) gaps.push(`${k}: no Company Tool output saved`);
}
index.gaps = [...new Set(gaps)];
write(indexFile, JSON.stringify(index, null, 2));
console.log(JSON.stringify({ matches: Object.keys(index.matches).length, codebases: Object.keys(index.codebases).length,
  items: Object.keys(index.items).length, issues: Object.keys(index.issues).length, gaps: index.gaps }, null, 2));
