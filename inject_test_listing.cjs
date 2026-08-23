const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function updateTestListing() {
  try {
    console.log('Injecting FAANG-Grade data into an existing listing...');
    
    // Check if new columns exist
    const checkColumns = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='listings' AND column_name IN ('amenity_clusters', 'child_safety_specs', 'rooms', 'nearby')"
    );
    
    const existingColumns = checkColumns.rows.map(r => r.column_name);
    
    for (const col of ['amenity_clusters', 'child_safety_specs', 'rooms', 'nearby']) {
        if (!existingColumns.includes(col)) {
            console.log("Adding missing column: " + col);
            await pool.query("ALTER TABLE listings ADD COLUMN " + col + " JSONB");
        }
    }

    const testData = {
        amenity_clusters: JSON.stringify({
            vibe: ["Ambient acoustics", "Architectural lighting", "Minimalist aesthetics", "Smart glass tinting"],
            comfort: ["Plush Egyptian cotton", "Climate control", "Heated flooring", "Aromatherapy diffusion"],
            work: ["Fiber Wi-Fi (1Gbps)", "Ergonomic Herman Miller setup", "Soundproof pod"],
            culinary: ["Miele appliances", "Espresso bar", "Private chef ready"]
        }),
        child_safety_specs: JSON.stringify([
            "Pool safety fence available",
            "Tamper-proof smart outlets",
            "Soft-edge architectural corners",
            "Toxin-free organic cleaning supplies"
        ]),
        rooms: JSON.stringify([
            {
                id: "room_1",
                name: "The Zenith Master Suite",
                type: "master",
                sqft: 850,
                price_modifier: 1.0,
                imageUrls: ["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"],
                features: ["Panoramic View", "Private Terrace", "Soaking Tub"]
            },
            {
                id: "room_2",
                name: "The Canopy Guest Suite",
                type: "guest",
                sqft: 450,
                price_modifier: 0.6,
                imageUrls: ["https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80"],
                features: ["Forest View", "En-suite Bath", "Work Desk"]
            }
        ]),
        nearby: JSON.stringify([
            { name: "National Park Entrance", distance: "5 min drive", type: "NATURE" },
            { name: "Artisan Cafe", distance: "10 min walk", type: "CAFE" },
            { name: "Stargazing Observatory", distance: "15 min drive", type: "EXPERIENCE" }
        ])
    };

    const res = await pool.query(`
        UPDATE listings 
        SET 
            rental_mode = 'hybrid',
            amenity_clusters = $1,
            child_safety_specs = $2,
            rooms = $3,
            nearby = $4
        WHERE id = (SELECT id FROM listings ORDER BY created_at DESC LIMIT 1)
        RETURNING id, title
    `, [testData.amenity_clusters, testData.child_safety_specs, testData.rooms, testData.nearby]);

    if (res.rows.length > 0) {
        console.log("✅ SUCCESS: Target Listing Upgraded! ID: " + res.rows[0].id + " | " + res.rows[0].title);
        console.log("Navigate to /listing/" + res.rows[0].id + " to view the FAANG-grade UI.");
    } else {
        console.log("No listings found in the database to update.");
    }

  } catch (err) {
    console.error('Update failed:', err);
  } finally {
    await pool.end();
  }
}

updateTestListing();
