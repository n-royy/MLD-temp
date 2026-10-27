"""Copy a text log with credentials masked. Usage: python -I redact.py SRC DST"""
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8', errors='replace').read()
patterns = [
    # JSON fields, plain or escaped inside JSON strings (\"password\":\"...\")
    (r'(\\*"(?:password|apiKeySecret|gameMasterPlayerSecret|authorization)\\*"\s*:\s*\\*")([^"\\]*)', r'\1[REDACTED]'),
    (r'(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}', r'\1[REDACTED]'),
    (r'gm_(?:live|test|team|player)_[A-Za-z0-9_-]+', '[REDACTED_KEY]'),
    (r'(?i)(PGPASSWORD\s*=\s*)\S+', r'\1[REDACTED]'),
    (r'(postgres(?:ql)?://[^:/\s"]+:)[^@\s"]+@', r'\1[REDACTED]@'),
]
count = 0
for pat, rep in patterns:
    text, n = re.subn(pat, rep, text)
    count += n
open(dst, 'w', encoding='utf-8', newline='').write(text)
left = len(re.findall(r'gm_(?:live|test|team|player)_[A-Za-z0-9]', text)) + \
    len(re.findall(r'\\*"password\\*"\s*:\s*\\*"(?!\[REDACTED\])[^"\\]', text))
print(f'{dst}: {count} masked, {left} suspicious left')
