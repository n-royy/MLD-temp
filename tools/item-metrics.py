"""Per-phase/per-item metrics from a Codex code-mode rollout: time windows, token deltas, retries."""
import json
import re
import sys
from datetime import datetime, timedelta

events = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
T = lambda e: datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) + timedelta(hours=7)
tok = []          # (time, cumulative usage)
calls = []        # (time, helper tool, key, result snippet)
cmds = []         # (time, failed?, snippet)
inputs = {}
for e in events:
    p = e.get('payload', {})
    if p.get('type') == 'token_count' and p.get('info'):
        tok.append((T(e), p['info']['total_token_usage']))
    if p.get('type') == 'custom_tool_call':
        inputs[p['call_id']] = (T(e), p.get('input', ''))
    if p.get('type') == 'custom_tool_call_output':
        t0, src = inputs.get(p['call_id'], (T(e), ''))
        out = ' '.join(x.get('text', '') for x in p.get('output', []) if isinstance(x, dict))
        for m in re.finditer(r'mcp__mtm_helper__(\w+)\(\{([^}]*)\}', src):
            key = re.search(r'(?:backlogItemKey|key|backlogId)\s*:\s*"([A-Z]+-\d+)"', m.group(2))
            calls.append((t0, m.group(1), key.group(1) if key else None, out))
        failed = bool(re.search(r'"exit_code":\s*[1-9]|Exit code: [1-9]|"isError":\s*true|"error":\s*\{', out))
        cmds.append((t0, failed, src[:160]))

def usage_at(t):
    last = tok[0][1]
    for tt, u in tok:
        if tt > t:
            break
        last = u
    return last

def delta(a, b):
    ua, ub = usage_at(a), usage_at(b)
    return {k: ub[k] - ua[k] for k in ('input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens')}

result = {'calls': [], 'phases': []}
for t, name, key, out in calls:
    if name in ('wait_for_update',):
        continue
    code = re.search(r'\\?"(?:code|status)\\?"\s*:\s*\\?"([A-Z_]+)', out)
    result['calls'].append({'time': f'{t:%H:%M:%S}', 'tool': name, 'key': key, 'result': code.group(1) if code else None})
waits = [t for t, n, k, o in calls if n == 'wait_for_update']
result['waitCalls'] = len(waits)
result['commands'] = len(cmds)
result['failedCommands'] = [{'time': f'{t:%H:%M:%S}', 'cmd': c} for t, f, c in cmds if f]
start_session = datetime.fromisoformat(events[0]['timestamp'].replace('Z', '+00:00')) + timedelta(hours=7)
end_session = T(events[-1])
result['session'] = {'start': f'{start_session:%H:%M:%S}', 'end': f'{end_session:%H:%M:%S}', 'total': tok[-1][1]}
windows = json.loads(sys.argv[2])
for w in windows:
    a = datetime.fromisoformat(w['from']).replace(tzinfo=start_session.tzinfo)
    b = datetime.fromisoformat(w['to']).replace(tzinfo=start_session.tzinfo)
    result['phases'].append({**w, 'minutes': round((b - a).total_seconds() / 60, 1), 'tokens': delta(a - timedelta(hours=7) + timedelta(hours=7), b)})
print(json.dumps(result, indent=1, default=str))
