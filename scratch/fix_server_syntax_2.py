import re

with open('server.ts', 'r') as f:
    content = f.read()

pattern = r'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n    \);\n\);\n\n  await pool\.query\(`'
replacement = r'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n    );\n  `);\n\n  await pool.query(`'

content = re.sub(pattern, replacement, content)

with open('server.ts', 'w') as f:
    f.write(content)
print("Fixed syntax error 2")
