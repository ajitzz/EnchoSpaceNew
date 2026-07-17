const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
    "const listingRes = await pool.query('SELECT title, address, type, price, city FROM listings WHERE id = $1', [listing_id]);",
    "const listingRes = await pool.query('SELECT title, address, type, price, city, lat, lng FROM listings WHERE id = $1', [listing_id]);"
);

const newPrompt = `          Analyze the geographic profile of this boutique stay/resort to recommend optimal metropolitan target markets and mapped Meta interests:
          
          Property Title: "\${listing.title}"
          Address/City: "\${listing.address || listing.city}"
          Coordinates: \${listing.lat || 'Unknown'}, \${listing.lng || 'Unknown'}
          Stay Type: "\${listing.type}"
          Price per Night: ₹\${listing.price}
          
          Identify 2-3 high-value metropolitan feeder markets (usually 100km - 500km away, or major flight hubs) from which high-income weekenders and travelers travel to book stays at this location. Avoid targeting the local community where the property sits (e.g. if the property is in Joshua Tree, do not target Joshua Tree residents; target LA residents. If in Karjat, target Mumbai residents).
          Also, define the optimal mapped Meta interests for targeting on Facebook/Instagram.
          
          Return a JSON object exactly matching this structure:
          {
            "recommended_locations": "Metropolitan cities list (comma-separated)",
            "feeder_insights": "A professional, brutally honest explanation of why these metro areas are the absolute highest-converting feeder markets for this property type.",
            "default_audience": "Audience buckets list (e.g. Couples, Tech Professionals, Families)",
            "audience_reach_count": 9200000,
            "meta_interests": "List of 3-5 mapped Meta interests (e.g. Luxury travel, Frequent travelers, Weekend getaway)"
          }
        \`;`;

code = code.replace(/const prompt = `[\s\S]*?`;/, newPrompt);

fs.writeFileSync('server.ts', code);
console.log('Updated server.ts');
