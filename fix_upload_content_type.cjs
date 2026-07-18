const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }`;

const replace = `    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    // Security: Restrict allowed content types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (!allowedTypes.includes(contentType)) {
       return res.status(400).json({ error: 'Invalid content type. Only images and videos are allowed.' });
    }`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('Added content type validation to upload-url');
