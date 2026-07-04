const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const oldViewport = `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`;
const newViewport = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: dark)">`;

code = code.replace(oldViewport, newViewport);
fs.writeFileSync('index.html', code);
