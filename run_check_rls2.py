import re
with open('server.ts', 'r') as f:
    content = f.read()

schema_code = content.split('const ensureMarketingSchema = async () => {')[1].split('marketingSchemaInitialized = true;')[0]
for i, line in enumerate(schema_code.split('\n')):
    if "user_id" in line:
        print(f"Line {i}:", line.strip())

