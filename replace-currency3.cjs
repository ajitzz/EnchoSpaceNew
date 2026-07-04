const fs = require('fs');

const file = 'components/ListingDetails.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/₹\{listing\.price\}/g, "{formatPrice(listing.price, listing.currency)}");
content = content.replace(/₹\{room\.price\}/g, "{formatPrice(room.price, listing.currency)}");
content = content.replace(/₹\{activeConfig\.price\.toLocaleString\(\)\}/g, "{formatPrice(activeConfig.price, listing.currency)}");
content = content.replace(/₹\{currentDayPrice\.toLocaleString\(\)\}/g, "{formatPrice(currentDayPrice, listing.currency)}");
content = content.replace(/₹\{\(activeConfig\.price - currentDayPrice\)\.toLocaleString\(\)\}/g, "{formatPrice(activeConfig.price - currentDayPrice, listing.currency)}");
content = content.replace(/₹\{maintenanceFee\.toLocaleString\(\)\}/g, "{formatPrice(maintenanceFee, listing.currency)}");
content = content.replace(/₹\{deposit\.toLocaleString\(\)\}/g, "{formatPrice(deposit, listing.currency)}");
content = content.replace(/₹\{totalRent\.toLocaleString\(undefined, \{ maximumFractionDigits: 0 \}\)\}/g, "{formatPrice(totalRent, listing.currency)}");
content = content.replace(/₹\{totalRent\.toLocaleString\(\)\}/g, "{formatPrice(totalRent, listing.currency)}");
content = content.replace(/₹\{item\.price\}/g, "{formatPrice(item.price, item.currency || 'USD')}");
content = content.replace(/₹/g, "$");

fs.writeFileSync(file, content);
console.log("Updated ListingDetails.tsx");
