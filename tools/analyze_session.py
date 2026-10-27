"""Summarize a Codex code-mode rollout: helper calls, errors, gaps, agent messages."""
import json
import re
import sys
from datetime import datetime, timedelta

path = sys.argv[1]
events = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]
ts = lambda e: datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) + timedelta(hours=7)
inputs = {}
prev = None
HELPER = re.compile(r'mtm_helper\W+(\w+)')
ERR = re.compile(r'"error"\s*:\s*\{|isError"?\s*:\s*true|Exit code: [1-9]|exit code [1-9]|FAILED|Error:', re.I)
for e in events:
    p = e.get('payload', {})
    t = ts(e)
    if prev and (t - prev).total_seconds() > 150:
        print(f'{t:%H:%M:%S} --- gap {(t - prev).total_seconds() / 60:.1f} min')
    prev = t
    typ = p.get('type')
    if typ == 'custom_tool_call':
        inputs[p['call_id']] = p.get('input', '')
    elif typ == 'custom_tool_call_output':
        src = inputs.get(p['call_id'], '')
        out = ' '.join(x.get('text', '') for x in p.get('output', []) if isinstance(x, dict))
        tools = sorted(set(HELPER.findall(src)) - {'wait_for_update'})
        if tools:
            m = re.search(r'"(?:status|code|reason)"\s*:\s*"([A-Z_]+)"', out)
            print(f'{t:%H:%M:%S} helper {",".join(tools)} -> {m.group(1) if m else out[60:200]!r}')
        elif ERR.search(out):
            cmd = re.search(r'cmd:\s*"((?:[^"\\]|\\.){0,140})', src)
            snippet = re.sub(r'\s+', ' ', out)[-220:]
            print(f'{t:%H:%M:%S} ERR? {cmd.group(1) if cmd else src[:120]!r} :: {snippet}')
    elif typ == 'message' and p.get('role') == 'assistant':
        text = ' '.join(c.get('text', '') for c in p.get('content', []))
        print(f'{t:%H:%M:%S} SAY {re.sub(chr(10), " ", text)[:220]}')
    elif e.get('type') == 'event_msg' and typ in ('task_complete', 'turn_aborted', 'task_started'):
        print(f'{t:%H:%M:%S} {typ.upper()} {json.dumps(p)[:160]}')
