const fs = require('fs');

const scriptContent = fs.readFileSync('patch_listing_details_rooms.cjs', 'utf-8');
const match = scriptContent.match(/const premiumCardComponent = `([\s\S]*?)`;\s*file =/);
if (match && match[1]) {
    const cardCode = match[1];
    const fullCode = `import React, { useState } from 'react';\n\n` + cardCode + `\nexport default PremiumInventoryUnitCard;\n`;
    fs.writeFileSync('components/PremiumInventoryUnitCard.tsx', fullCode);
    console.log("Card component created.");
} else {
    console.log("Match failed.");
}
