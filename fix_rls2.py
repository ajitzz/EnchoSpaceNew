import re
with open('server.ts', 'r') as f:
    content = f.read()

# Replace host_id with user_id for the marketing tables which caused the RLS error.
# Table marketing_campaigns doesn't have host_id, it has host_id instead of user_id in the policy.
# Let's just fix the exact policy causing the issue: host_social_posts and any other.
# Actually let's look for "host_id =" in the policy section.
content = content.replace("USING (host_id = current_app_user_id()", "USING (user_id = current_app_user_id()")

with open('server.ts', 'w') as f:
    f.write(content)
