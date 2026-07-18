import re

with open('server.ts', 'r') as f:
    content = f.read()

content = content.replace("import xss from 'xss';", "import xss from 'xss';\nimport compression from 'compression';")

with open('server.ts', 'w') as f:
    f.write(content)
