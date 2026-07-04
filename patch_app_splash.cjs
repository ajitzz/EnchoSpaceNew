const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const effectTarget = `useEffect(() => {
    // Hide splash screen
    const splash = document.getElementById('native-splash');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
            setTimeout(() => splash.remove(), 600);
        }, 100);
    }`;

if (!code.includes('native-splash')) {
    code = code.replace(`useEffect(() => {`, effectTarget);
    fs.writeFileSync('App.tsx', code);
}
