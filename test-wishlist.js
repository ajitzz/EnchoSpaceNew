const url = 'http://localhost:3000/api/wishlists';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBkZW1vLmNvbSIsIm5hbWUiOiJEZW1vIERhdGEiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3ODE4NTUxNDAsImV4cCI6MTc4MTk0MTU0MH0.wd3W937ef39phDKUuQuzWPR68Z0fMJmzPFXDg1433NU';

fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  .then(res => res.text().then(text => console.log(res.status, text)));
