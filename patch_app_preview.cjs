const fs = require('fs');
let app = fs.readFileSync('App.tsx', 'utf-8');

app = app.replace(
    "const validViews = ['SEARCH', 'DETAILS', 'EXPERIENCE_DETAILS', 'BOOKING', 'WISHLIST', 'RESERVATIONS', 'MESSAGES', 'HOSTING', 'HOST_DASHBOARD', 'ADMIN'];",
    "const validViews = ['SEARCH', 'DETAILS', 'EXPERIENCE_DETAILS', 'BOOKING', 'WISHLIST', 'RESERVATIONS', 'MESSAGES', 'HOSTING', 'HOST_DASHBOARD', 'ADMIN', 'PREVIEW_HOST'];"
);

const oldElse = `      } else {
        if (!hash) {
          setCurrentView('SEARCH');
        } else if (validViews.includes(hash)) {`;

const newElse = `      } else {
        if (!hash) {
          setCurrentView('SEARCH');
        } else if (hash === 'PREVIEW_HOST') {
            const previewStr = localStorage.getItem('hostPreviewListing');
            if (previewStr) {
                try {
                    setSelectedListing(JSON.parse(previewStr));
                    setCurrentView('DETAILS');
                } catch(e) {
                    setCurrentView('SEARCH');
                }
            } else {
                setCurrentView('SEARCH');
            }
        } else if (validViews.includes(hash)) {`;

if (!app.includes('PREVIEW_HOST')) {
    app = app.replace(oldElse, newElse);
    fs.writeFileSync('App.tsx', app);
    console.log('App patched');
}
