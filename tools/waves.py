"""Print when new backlog items were seen in a Codex rollout, with their publishedAt times."""
import json
import re
import sys
from datetime import datetime, timedelta

for line in open(sys.argv[1], encoding='utf-8'):
    e = json.loads(line)
    p = e.get('payload', {})
    if p.get('type') != 'custom_tool_call_output':
        continue
    out = ' '.join(x.get('text', '') for x in p.get('output', []) if isinstance(x, dict)).replace('\\', '')
    m = re.search(r'newItems":\[([^\]]+)\]', out)
    if not m:
        continue
    pub = sorted(set(re.findall(r'publishedAt":"([0-9T:.-]+Z)', out)))
    t = datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) + timedelta(hours=7)
    print(f'{t:%H:%M:%S}', m.group(1), pub)
