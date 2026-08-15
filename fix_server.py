with open('server.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if "CREATE TABLE IF NOT EXISTS meta_api_traces" in line:
        pass
    elif line.strip() == ");" and len(new_lines) > 20 and "meta_api_traces" in new_lines[-22]:
        new_lines.extend([
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255);`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS host_id INTEGER REFERENCES users(id);`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS step VARCHAR(255);`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS endpoint VARCHAR(1000);`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS request_payload JSONB;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS response_payload JSONB;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS http_status INTEGER;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS fbtrace_id VARCHAR(255);`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_code INTEGER;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_subcode INTEGER;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_message TEXT;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_type VARCHAR(255);`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_is_transient BOOLEAN;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_title TEXT;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_msg TEXT;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS latency_ms INTEGER;`);\n",
            "  await pool.query(`ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`);\n"
        ])

with open('server.ts', 'w') as f:
    f.writelines(new_lines)

