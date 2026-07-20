import re
with open('server.ts', 'r') as f:
    content = f.read()

target = """      if (isRequest) {
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId ? String(userId) : '']);
        await client.query(`SELECT set_config('app.bypass_rls', $1, true)`, [bypassRls ? 'true' : 'false']);
      } else {
        await client.query(`SELECT set_config('app.bypass_rls', 'true', true)`);
        await client.query(`SELECT set_config('app.current_user_id', '', true)`);
      }
      const result = await client.query(text, params);
      return result;"""

replacement = """      if (isRequest) {
        await client.query(`SELECT set_config('app.current_user_id', $1, false)`, [userId ? String(userId) : '']);
        await client.query(`SELECT set_config('app.bypass_rls', $1, false)`, [bypassRls ? 'true' : 'false']);
      } else {
        await client.query(`SELECT set_config('app.bypass_rls', 'true', false)`);
        await client.query(`SELECT set_config('app.current_user_id', '', false)`);
      }
      try {
        const result = await client.query(text, params);
        return result;
      } finally {
        await client.query(`SELECT set_config('app.bypass_rls', 'true', false)`);
        await client.query(`SELECT set_config('app.current_user_id', '', false)`);
      }"""

if target in content:
    content = content.replace(target, replacement)
    with open('server.ts', 'w') as f:
        f.write(content)
    print("Patched RLS")
else:
    print("Target not found")
