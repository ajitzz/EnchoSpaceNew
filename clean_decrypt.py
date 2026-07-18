import re

with open('server.ts', 'r') as f:
    content = f.read()

# The regex matches from export function decryptPII to the closing brace, including the // ========================================== blocks.
pattern = r"// ==========================================\nexport function decryptPII.*?}\n(?=// ==========================================|$)"
content = re.sub(pattern, "", content, flags=re.DOTALL)

# Also remove ENCRYPTION_KEY_HEX if it's there
content = re.sub(r"const ENCRYPTION_KEY_HEX = .*?;\n", "", content)

# Remove any stray empty // ========================================== lines
content = re.sub(r"// ==========================================\n// PHASE 4: SECURITY & VALIDATION SCHEMAS\n// ==========================================\n", "", content)

with open('server.ts', 'w') as f:
    f.write(content)
