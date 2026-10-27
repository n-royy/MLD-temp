// Minimal JSON Schema (2020-12) validator for submit.json contracts. Covers the keywords the
// Game Master submit schemas use; unknown keywords are ignored. Returns a list of error strings.
const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const isType = (v, t) => t === 'number' ? typeof v === 'number' : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resolve(root, ref) {
  if (!ref.startsWith('#')) return null;
  return ref.slice(1).split('/').filter(Boolean)
    .reduce((node, part) => node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

export function validateSchema(schema, value, root = schema, at = '$') {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [`${at}: not allowed`];
  const errors = [];
  const push = msg => errors.push(`${at}: ${msg}`);
  if (schema.$ref) {
    const target = resolve(root, schema.$ref);
    if (!target) push(`unresolved $ref ${schema.$ref}`);
    else errors.push(...validateSchema(target, value, root, at));
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => isType(value, t))) { push(`expected ${types.join('|')}, got ${typeOf(value)}`); return errors; }
  }
  if ('const' in schema && !equal(schema.const, value)) push(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(e => equal(e, value))) push(`must be one of ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) push(`shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) push(`longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) push(`does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) push(`below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) push(`above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push(`needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push(`allows at most ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) push('items must be unique');
    const prefix = schema.prefixItems ?? [];
    prefix.forEach((s, i) => { if (i < value.length) errors.push(...validateSchema(s, value[i], root, `${at}[${i}]`)); });
    if (schema.items !== undefined) {
      for (let i = prefix.length; i < value.length; i++) errors.push(...validateSchema(schema.items, value[i], root, `${at}[${i}]`));
    }
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) push(`missing required "${key}"`);
    const props = schema.properties ?? {};
    for (const [key, v] of Object.entries(value)) {
      if (key in props) errors.push(...validateSchema(props[key], v, root, `${at}.${key}`));
      else if (schema.additionalProperties === false) push(`unexpected property "${key}"`);
      else if (typeof schema.additionalProperties === 'object') errors.push(...validateSchema(schema.additionalProperties, v, root, `${at}.${key}`));
    }
  }
  for (const s of schema.allOf ?? []) errors.push(...validateSchema(s, value, root, at));
  if (schema.anyOf && !schema.anyOf.some(s => validateSchema(s, value, root, at).length === 0)) push('matches none of anyOf');
  if (schema.oneOf && schema.oneOf.filter(s => validateSchema(s, value, root, at).length === 0).length !== 1) push('must match exactly one of oneOf');
  if (schema.not && validateSchema(schema.not, value, root, at).length === 0) push('must not match "not"');
  if (schema.if !== undefined) {
    const branch = validateSchema(schema.if, value, root, at).length === 0 ? schema.then : schema.else;
    if (branch !== undefined) errors.push(...validateSchema(branch, value, root, at));
  }
  return errors;
}

/** Contract problems of an answer object: schema errors, PASS rows without evidence, missing evidence files.
 *  Shared by the helper and by the stand-alone validator a worker runs in its slot. */
export function answerProblems(schema, answer, evidenceExists) {
  const problems = [];
  if (schema) problems.push(...validateSchema(schema, answer).map(e => `schema ${e}`));
  for (const [i, row] of (Array.isArray(answer?.testResults) ? answer.testResults : []).entries()) {
    if (row?.result === 'PASS' && !(Array.isArray(row.evidence) && row.evidence.length)) problems.push(`testResults[${i}] is PASS without an evidence array`);
  }
  const refs = [];
  const walk = v => {
    if (typeof v === 'string') { if (/^evidence\/\S+$/.test(v)) refs.push(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(answer);
  for (const ref of refs) if (!evidenceExists(ref)) problems.push(`missing evidence file ${ref}`);
  return { problems, schemaChecked: Boolean(schema), evidence: refs };
}
