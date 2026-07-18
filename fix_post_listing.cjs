const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, userId, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;

    // Validate`;

const replace = `    const { title, description, price, type, address, city, imageUrl, imageUrls, videoUrl, rentalMode, rooms, maxGuests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamicPricing, seo_title, seo_description, seo_keywords, seo_image_url } = req.body;
    
    // Security: Use authenticated user ID, ignore body userId to prevent IDOR spoofing
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: User ID required.' });

    // Validate`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('IDOR check added to post listing');
