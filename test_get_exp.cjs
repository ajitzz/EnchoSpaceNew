async function test() {
  const res = await fetch('http://localhost:3000/api/experiences?host_id=1');
  const data = await res.json();
  console.log('length is', data.length);
}
test();
