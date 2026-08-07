const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const r = /const logEntry = \{[\s\S]*?syncLogs\.steps\.push\(logEntry\);/;
if (r.test(code)) {
    code = code.replace(r, match => match + `
        // Enterprise Meta Debug Recorder Insert
        try {
          await pool.query(\`
            INSERT INTO meta_api_traces (
              correlation_id, campaign_id, host_id, step, endpoint, request_payload, response_payload, http_status, fbtrace_id, meta_error_code, meta_error_subcode, meta_error_message, meta_error_type, meta_error_is_transient, meta_error_user_title, meta_error_user_msg, latency_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          \`, [
            correlationId,
            id,
            req.user.id,
            stepName,
            endpoint,
            JSON.stringify(redactedPayload),
            JSON.stringify(data),
            res.status,
            data.error?.fbtrace_id || null,
            data.error?.code || null,
            data.error?.error_subcode || null,
            data.error?.message || null,
            data.error?.type || null,
            data.error?.is_transient || null,
            data.error?.error_user_title || null,
            data.error?.error_user_msg || null,
            executionTime
          ]);
        } catch(e) {
          console.error('[META API TRACES] Failed to save trace', e.message);
        }
`);
    fs.writeFileSync('server.ts', code);
    console.log('Replaced successfully via regex');
} else {
    console.log('Target not found in server.ts');
}
