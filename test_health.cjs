const fetch = globalThis.fetch;
async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/admin/meta-health');
    const data = await res.json();
    console.log(JSON.stringify(data.gates.find(g => g.gate_id === 14), null, 2));
    console.log("Overall status:", data.overall_status);
  } catch(e) {
    console.error(e);
  }
}
run();
