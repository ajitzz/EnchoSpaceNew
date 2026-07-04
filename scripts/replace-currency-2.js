const fs = require('fs');

const file = 'components/ListingDetails.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('useCurrency')) {
    content = content.replace("import React,", "import { useCurrency } from './CurrencyContext';\nimport React,");
}

if (!content.includes('const { formatPrice } = useCurrency()')) {
    content = content.replace("const ListingDetails: React.FC<ListingDetailsProps> = ({ listing, onClose, onReservesViewToggle, initialBookingStep }) => {", 
      "const ListingDetails: React.FC<ListingDetailsProps> = ({ listing, onClose, onReservesViewToggle, initialBookingStep }) => {\n    const { formatPrice } = useCurrency();");
}

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

fs.writeFileSync(file, content);
console.log("Updated ListingDetails.tsx");
