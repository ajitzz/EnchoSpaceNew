import re
with open('server.ts', 'r') as f:
    content = f.read()

# Let's find exactly what line in ensureMarketingSchema is causing this column "user_id" does not exist error.
schema_code = content.split('const ensureMarketingSchema = async () => {')[1].split('marketingSchemaInitialized = true;')[0]
for line in schema_code.split('\n'):
    if "POLICY" in line and "user_id" in line:
        print("BAD POLICY LINE:", line.strip())

