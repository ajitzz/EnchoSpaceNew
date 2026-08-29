import re

with open('server.ts', 'r') as f:
    content = f.read()

pattern = r'\);\n\s+`\n\s+CREATE TABLE IF NOT EXISTS room_types'
replacement = r');\n    CREATE TABLE IF NOT EXISTS room_types'

content = re.sub(pattern, replacement, content)

with open('server.ts', 'w') as f:
    f.write(content)
print("Fixed syntax error")
