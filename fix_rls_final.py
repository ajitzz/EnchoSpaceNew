import re
with open('server.ts', 'r') as f:
    content = f.read()

# I see it failed when we changed host_id to user_id. Let's look at the columns of host_social_posts in the schema definition above in server.ts
content = content.replace("USING (user_id = current_app_user_id()", "USING (host_id = current_app_user_id()")

# But if host_id does not exist, it must be something else. Let's look at ensureMarketingSchema
ensure_schema = content.split('const ensureMarketingSchema = async () => {')[1].split(' marketingSchemaInitialized = true;')[0]
print(ensure_schema[:1000]) # just checking if we can see the host_social_posts table
