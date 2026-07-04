const fs = require('fs');
let code = fs.readFileSync('index.css', 'utf8');

if (!code.includes('-webkit-text-size-adjust')) {
    code = code.replace(`* {
    -ms-overflow-style: none;`, `* {
    -webkit-text-size-adjust: 100%;
    -ms-overflow-style: none;`);
    fs.writeFileSync('index.css', code);
}
