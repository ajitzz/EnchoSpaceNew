import re

with open('server.ts', 'r') as f:
    content = f.read()

pattern = re.compile(r'// Phase 4\.1: Field-Level Encryption for PII at Rest\nconst ENCRYPTION_KEY_HEX.*?\n}\n\n', re.DOTALL)
content = pattern.sub('// ==========================================\n', content)

with open('server.ts', 'w') as f:
    f.write(content)
