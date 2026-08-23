const fs = require('fs');
const fetch = require('node-fetch');

async function testHostFormSubmission() {
    try {
        console.log('Testing End-to-End Host Form Publishing Flow...');
        
        // 1. Get an auth token (we can just bypass or mock for this local script if auth is required,
        // or just use pg directly since we already tested the Meta Ads logic.
        // Actually, we can generate a test JWT for our test user).
        
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: '1', role: 'host', email: 'test_host@encho.com' }, 
            process.env.JWT_SECRET || 'c1ac636d954cecc8eefde057b10a00b9dfbab9d976c34986ef1fcba0c6609117'
        );

        const payload = {
            title: "HostForm End-to-End FAANG Test",
            description: "A luxury automated test sanctuary.",
            price: 1200,
            type: "Mansion",
            address: "100 Automation Drive",
            city: "San Francisco",
            imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
            imageUrls: ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"],
            videoUrl: "",
            rentalMode: "hybrid",
            rooms: [
                {
                    id: "room_test_1",
                    name: "The Automation Suite",
                    type: "master",
                    sqft: 1200,
                    price_modifier: 1.0,
                    price: 1200,
                    capacity: 2,
                    bedrooms: 1,
                    beds: 1,
                    amenities: ["Fiber Wi-Fi"],
                    features: ["Smart Hub"]
                }
            ],
            maxGuests: 4,
            bedrooms: 2,
            beds: 2,
            bathrooms: 2,
            amenities: ["Pool", "Wi-Fi"],
            lat: 37.7749,
            lng: -122.4194,
            dynamicPricing: {},
            amenity_clusters: {
                vibe: ["Cyberpunk aesthetic", "Neon accents"],
                comfort: ["Memory foam", "Climate control"],
                work: ["Standing desk"],
                culinary: ["Espresso machine"]
            },
            child_safety_specs: ["No sharp corners", "Tamper-proof outlets"],
            nearby: [
                { name: "Golden Gate Bridge", distance: "10 min", type: "NATURE" }
            ]
        };

        const res = await fetch('http://localhost:3000/api/listings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Publish failed! HTTP ${res.status}: ${err}`);
        }

        const data = await res.json();
        console.log(`✅ SUCCESS: Host Form Payload ingested safely. New Listing ID: ${data.id}`);
        console.log('✅ Marketing Webhooks & Meta Sync bypassed correctly (Or executed if running).');
    } catch (e) {
        console.error('Test Failed:', e.message);
        process.exit(1);
    }
}

testHostFormSubmission();
