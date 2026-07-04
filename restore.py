import difflib

with open('dist/server.js') as f:
    js_lines = f.readlines()
with open('server.ts') as f:
    ts_lines = f.readlines()

def norm(l):
    import re
    # Remove all whitespace to compare
    return re.sub(r'\s+', '', l)

js_n = [norm(l) for l in js_lines if l.strip()]
ts_n = [norm(l) for l in ts_lines if l.strip()]

# Let's map JS normalized lines back to their original JS lines
js_map = {}
idx = 0
for l in js_lines:
    if l.strip():
        js_map[idx] = l
        idx += 1

# Same for TS
ts_map = {}
idx = 0
for l in ts_lines:
    if l.strip():
        ts_map[idx] = l
        idx += 1

sm = difflib.SequenceMatcher(None, js_n, ts_n)
restored = []

for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        for j in range(j1, j2):
            restored.append(ts_map[j])
    elif tag == 'insert':
        for j in range(j1, j2):
            restored.append(ts_map[j])
    elif tag == 'delete':
        for i in range(i1, i2):
            if '});' in js_map[i]:
                restored.append(js_map[i])
    elif tag == 'replace':
        # TS lines take precedence
        # But if JS lines have '});' that is missing in TS lines, insert it
        # Actually, let's just append the TS lines first
        for j in range(j1, j2):
            restored.append(ts_map[j])
        
        # Check if JS has '});'
        for i in range(i1, i2):
            if '});' in js_map[i]:
                # We need to insert it. Let's just append it after the TS lines.
                # In many cases, it's a closing bracket at the end.
                restored.append(js_map[i])

with open('server_restored.ts', 'w') as f:
    f.writelines(restored)
