const fs = require('fs');
let app = fs.readFileSync('App.tsx', 'utf-8');

app = app.replace(
    "} catch(e) {}",
    "} catch(e) { console.error('Preview parse error:', e); }"
);

fs.writeFileSync('App.tsx', app);
console.log('Lint error fixed');
