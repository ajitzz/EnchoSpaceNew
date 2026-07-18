import re

with open('server.ts', 'r') as f:
    content = f.read()

# Replace any occurrence of:
# }
# }
# // ==========================================
# with just the comment

content = re.sub(r"\}\n\}\n// ==========================================", "// ==========================================", content)
content = re.sub(r"\}\n// ==========================================", "// ==========================================", content)

with open('server.ts', 'w') as f:
    f.write(content)
