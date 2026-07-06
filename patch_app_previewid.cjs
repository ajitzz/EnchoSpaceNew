const fs = require('fs');
let app = fs.readFileSync('App.tsx', 'utf-8');

app = app.replace(
    "const found = allListings.find((l: any) => String(l.id) === String(id));",
    `let found = allListings.find((l: any) => String(l.id) === String(id));
                if (!found && id === 'preview-id') {
                    const previewStr = localStorage.getItem('hostPreviewListing');
                    if (previewStr) {
                        try { found = JSON.parse(previewStr); } catch(e) {}
                    }
                }`
);

fs.writeFileSync('App.tsx', app);
console.log('App patched for preview-id');
