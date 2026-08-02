try {
  const a = { b: { c: "123" } };
  console.log((a?.b?.c || 0).toFixed(2));
} catch (e) {
  console.log("TEST 1:", e.message);
}

try {
  const campaign = { analytics: { ctr: "12.3" } };
  console.log((campaign.analytics?.ctr || 0).toFixed(2));
} catch (e) {
  console.log("TEST 2:", e.message);
}
