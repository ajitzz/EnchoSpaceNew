const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const badStats = `    // Latency metrics
    const latencyRes = await pool.query(\\\`
      SELECT 
        stage, 
        AVG(latency_ms) as avg_latency,
        percentile_cont(0.95) within group (order by latency_ms) as p95_latency,
        percentile_cont(0.99) within group (order by latency_ms) as p99_latency
      FROM meta_api_traces
      WHERE latency_ms IS NOT NULL
      GROUP BY stage
    \\\`);`;

const goodStats = `    // Latency metrics
    const latencyRes = await pool.query(\\\`
      SELECT 
        step as stage, 
        AVG(latency_ms) as avg_latency,
        percentile_cont(0.95) within group (order by latency_ms) as p95_latency,
        percentile_cont(0.99) within group (order by latency_ms) as p99_latency
      FROM meta_api_traces
      WHERE latency_ms IS NOT NULL
      GROUP BY step
    \\\`);`;

if (code.includes(badStats.replace(/\\`/g, '\`'))) {
    code = code.replace(badStats.replace(/\\`/g, '\`'), goodStats.replace(/\\`/g, '\`'));
    fs.writeFileSync('server.ts', code);
    console.log("Fixed stats query");
} else {
    console.log("Could not find stats query");
}
