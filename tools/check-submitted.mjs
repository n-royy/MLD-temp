// Validates each submitted answer (at its submitted revision) against the item's submit schema.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [checkout, folder, schemaModule] = process.argv.slice(2);
const { validateSchema } = await import(pathToFileURL(schemaModule).href);
const subs = JSON.parse(readFileSync(`${checkout}/.git/mtm/submissions.json`, 'utf8'));
for (const [key, s] of Object.entries(subs)) {
  const start = JSON.parse(readFileSync(`${checkout}/.git/mtm/${key}.start.json`, 'utf8'));
  let schema = start.files[`challenge/${key}-submit.schema.json`];
  if (typeof schema === 'string') schema = JSON.parse(schema);
  const answer = JSON.parse(execFileSync('git', ['show', `${s.gitRevision}:${folder}/answers/${key}/submit.json`], { cwd: checkout, encoding: 'utf8' }));
  const errs = validateSchema(schema, answer);
  const rows = (answer.testResults ?? []).map(r => `${r.id}=${r.result}`).join(' ');
  console.log(JSON.stringify({ key, revision: s.gitRevision.slice(0, 7), status: answer.status, schemaErrors: errs.length, first: errs.slice(0, 3), rows }));
}
