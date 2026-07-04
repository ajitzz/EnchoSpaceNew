const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('₹')) return;
    
    // Check if useCurrency is already properly imported
    if (!content.includes('useCurrency')) {
        // Quick and dirty insertion after react import
        content = content.replace(/(import React[^;]*;)/, "$1\nimport { useCurrency } from './CurrencyContext';");
    }
    
    content = content.replace(/₹\{([^}]+)\}/g, "{formatPrice($1)}");
    content = content.replace(/₹/g, "$");
    
    fs.writeFileSync(filePath, content);
}

[
    'components/AdminDashboard.tsx',
    'components/BookingPage.tsx',
    'components/CheckoutModal.tsx',
    'components/FilterBar.tsx',
    'components/HostCalendar.tsx',
    'components/HostDashboard.tsx',
    'components/HostForm.tsx',
    'components/MapSidebar.tsx',
    'components/ReservationsPage.tsx'
].forEach(processFile);
