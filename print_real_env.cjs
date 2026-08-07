const keys = Object.keys(process.env).filter(k => k.startsWith('META'));
keys.forEach(k => console.log(k + '=' + process.env[k]));
