const fs = require('fs');
let code = fs.readFileSync('components/ListingDetails.tsx', 'utf8');

const target = `  useEffect(() => {
     fetch(\`/api/listings/\${listing.id}/calendar?_t=\${Date.now()}\`, { cache: 'no-store' })`;

const replacement = `  useEffect(() => {
     // Gap 15: Retargeting Hook - Firing Server-Side Pixel on page load
     fetch('/api/marketing/track/view', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ listingId: listing.id })
     }).catch(console.error);

     fetch(\`/api/listings/\${listing.id}/calendar?_t=\${Date.now()}\`, { cache: 'no-store' })`;

code = code.replace(target, replacement);

fs.writeFileSync('components/ListingDetails.tsx', code);
console.log('Added tracking call to ListingDetails');
