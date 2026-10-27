// Prints only the account email/plan from Codex auth.json (never tokens).
import { readFileSync } from 'node:fs';
const auth = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const claims = jwt => { try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };
const id = claims(auth?.tokens?.id_token ?? '');
const access = claims(auth?.tokens?.access_token ?? '');
const info = id['https://api.openai.com/auth'] ?? access['https://api.openai.com/auth'] ?? {};
console.log(JSON.stringify({
  authMode: auth.auth_mode ?? (auth.OPENAI_API_KEY ? 'apikey' : 'chatgpt'),
  email: id.email ?? access['https://api.openai.com/profile']?.email ?? null,
  plan: info.chatgpt_plan_type ?? null,
  lastRefresh: auth.last_refresh ?? null
}));
