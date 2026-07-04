import re
import difflib

def strip_types(line):
    line = re.sub(r':\s*[A-Za-z0-9_<>\[\]|]+(?=[,)])', '', line)
    line = re.sub(r'as\s+[A-Za-z0-9_<>\[\]]+', '', line)
    return re.sub(r'\s+', '', line)

with open('dist/server.js') as f: js_lines = f.readlines()
with open('server.bak.ts') as f: ts_lines = f.readlines()

js_n = [strip_types(l) for l in js_lines]
ts_n = [strip_types(l) for l in ts_lines]

sm = difflib.SequenceMatcher(None, js_n, ts_n)
restored = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        restored.extend(ts_lines[j1:j2])
    elif tag == 'insert':
        restored.extend(ts_lines[j1:j2])
    elif tag == 'delete':
        for i in range(i1, i2):
            if '});' in js_lines[i] or '})' in js_lines[i] or '}' in js_lines[i]:
                restored.append(js_lines[i])
    elif tag == 'replace':
        restored.extend(ts_lines[j1:j2])
        for i in range(i1, i2):
            if '});' in js_lines[i]:
                restored.append(js_lines[i])

with open('server.ts', 'w') as f:
    f.writelines(restored)
