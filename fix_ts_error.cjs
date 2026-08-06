const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

code = code.replace(
  "const isIndia = (listing.currency === 'INR') || (listing.city && indianCities.some(c => listing.city.toLowerCase().includes(c.toLowerCase()))) || (listing.address && indianCities.some(c => listing.address.toLowerCase().includes(c.toLowerCase())));",
  "const isIndia = (listing.currency === 'INR') || (listing.city && indianCities.some(c => listing.city?.toLowerCase().includes(c.toLowerCase()))) || (listing.address && indianCities.some(c => listing.address?.toLowerCase().includes(c.toLowerCase())));"
);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed TS Error');
