import re

with open('server.ts', 'r') as f:
    content = f.read()

# Pattern for the decryptPII function
pattern = r"export function decryptPII.*?}\n"
content = re.sub(pattern, "", content, flags=re.DOTALL)

with open('server.ts', 'w') as f:
    f.write(content)
