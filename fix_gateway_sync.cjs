const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetListingChange = `      setFormData(prev => ({
        ...prev,
        listing_id: listingId,`;

const newListingChange = `      const indianCities = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Goa', 'Jaipur', 'Udaipur', 'Kochi', 'Chennai', 'Kolkata'];
      const isIndia = (listing.currency === 'INR') || (listing.city && indianCities.some(c => listing.city.toLowerCase().includes(c.toLowerCase()))) || (listing.address && indianCities.some(c => listing.address.toLowerCase().includes(c.toLowerCase())));
      setSelectedGateway(isIndia ? 'razorpay' : 'stripe');

      setFormData(prev => ({
        ...prev,
        listing_id: listingId,`;

code = code.replace(targetListingChange, newListingChange);
fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed Gateway Sync');
