import re
with open('server.ts', 'r') as f:
    content = f.read()

# Fix the host_id column error in RLS by changing host_id to user_id in the policy.
content = content.replace("host_id = current_setting('request.jwt.claim.sub')", "user_id = current_setting('request.jwt.claim.sub')::integer")

with open('server.ts', 'w') as f:
    f.write(content)
