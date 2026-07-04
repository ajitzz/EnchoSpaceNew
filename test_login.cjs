async function test() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ajithsabzz@gmail.com', password: 'password' })
  });
  console.log(await res.json());
}
test();
