const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  'SELECT c.*, l.title as listing_title, l.description as listing_desc, l.image_url as listing_image, l.city',
  'SELECT c.*, l.title as listing_title, l.description as listing_desc, l.image_url as listing_image, l.city, l.amenities as listing_amenities'
);

fs.writeFileSync('server.ts', code);
console.log("Fixed meta mapper query");
