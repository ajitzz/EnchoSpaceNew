const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    res.json({
      health: queueHealthRes.rows[0],
      latency: latencyRes.rows,
      dlq: dlqRes.rows[0],
      common_failures: failureRes.rows
    });`;

const replacement = `    const h = queueHealthRes.rows[0];
    const total = Number(h.total_transactions) || 0;
    const success = Number(h.success) || 0;
    // Success rate is calculated strictly on terminal SUCCESS state over total transactions
    const success_rate = total > 0 ? Math.round((success / total) * 100) : 100;
    
    // avg_latency_ms is average of latency
    const avg_latency_ms = latencyRes.rows.length > 0 ? Math.round(latencyRes.rows.reduce((sum, r) => sum + Number(r.avg_latency), 0) / latencyRes.rows.length) : 0;

    res.json({
      health: h,
      latency: latencyRes.rows,
      dlq: dlqRes.rows[0],
      common_failures: failureRes.rows,
      total_transactions: total,
      success_rate,
      avg_latency_ms
    });`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched stats calculation in server.ts');
} else {
  console.log('Target not found for stats patch');
}
