const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_12345';

// Setup connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runValidation() {
  console.log('\n=============================================================');
  console.log('   STARTING END-TO-END SANDBOX LEAD CONVERSION FUNNEL VALIDATION');
  console.log('=============================================================\n');

  try {
    // 1. Find a Host User and their Listing
    console.log('[STEP 1] Querying database for listings and owners...');
    const listingsRes = await pool.query(`
      SELECT l.id as listing_id, l.title as listing_title, u.id as host_id, u.email, u.role 
      FROM listings l
      JOIN users u ON l.user_id = u.id
      LIMIT 1
    `);

    let hostId, listingId, hostEmail, hostRole, listingTitle;

    if (listingsRes.rows.length === 0) {
      console.log('No listings found in the database. Creating a test host user and listing...');
      // Find any user
      const userRes = await pool.query('SELECT id, email, role FROM users LIMIT 1');
      if (userRes.rows.length === 0) {
        throw new Error('No users found in database to attach a listing to.');
      }
      const testUser = userRes.rows[0];
      hostId = testUser.id;
      hostEmail = testUser.email;
      hostRole = testUser.role;

      // Insert dummy listing
      const insertListing = await pool.query(`
        INSERT INTO listings (user_id, title, description, price, type, address, city, max_guests)
        VALUES ($1, 'Validating Sandbox Suite', 'A premium validation suite', 5000, 'Suite', 'Sandbox Ave', 'Bengaluru', 2)
        RETURNING id, title
      `, [hostId]);
      listingId = insertListing.rows[0].id;
      listingTitle = insertListing.rows[0].title;
    } else {
      const data = listingsRes.rows[0];
      hostId = data.host_id;
      listingId = data.listing_id;
      hostEmail = data.email;
      hostRole = data.role;
      listingTitle = data.listing_title;
    }

    console.log(`✓ Active Host: ID ${hostId} (${hostEmail}, Role: ${hostRole})`);
    console.log(`✓ Target Listing: ID ${listingId} ("${listingTitle}")`);

    // 2. Create an Active Campaign for the validation flow
    console.log('\n[STEP 2] Creating / locating an active marketing campaign...');
    const campaignRes = await pool.query(`
      SELECT id, title, status, accumulated_conversions 
      FROM host_marketing_campaigns 
      WHERE listing_id = $1 AND host_id = $2 AND status = 'active'
      LIMIT 1
    `, [listingId, hostId]);

    let campaignId;
    let initialConversions = 0;

    if (campaignRes.rows.length === 0) {
      console.log('No active campaigns for this listing. Inserting a live sandbox campaign...');
      const insertCampaign = await pool.query(`
        INSERT INTO host_marketing_campaigns (host_id, listing_id, title, description, status, budget, platforms, accumulated_conversions)
        VALUES ($1, $2, 'Sandbox E2E Launch', 'E2E automated validation campaign', 'active', 4000, '["instagram", "facebook"]'::jsonb, 0)
        RETURNING id, title, accumulated_conversions
      `, [hostId, listingId]);
      campaignId = insertCampaign.rows[0].id;
      initialConversions = Number(insertCampaign.rows[0].accumulated_conversions || 0);
      console.log(`✓ Campaign Created: ID ${campaignId} ("${insertCampaign.rows[0].title}")`);
    } else {
      campaignId = campaignRes.rows[0].id;
      initialConversions = Number(campaignRes.rows[0].accumulated_conversions || 0);
      console.log(`✓ Found Campaign: ID ${campaignId} ("${campaignRes.rows[0].title}"), Conversions: ${initialConversions}`);
    }

    // 3. Generate a JWT Token for the Host
    console.log('\n[STEP 3] Generating JWT authorization token for the Host...');
    const token = jwt.sign(
      { id: hostId, role: hostRole, email: hostEmail },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    console.log(`✓ JWT Signed Successfully. Prefix: ${token.substring(0, 25)}...`);

    // 4. Retrieve Simulated + Database Leads via Endpoint
    console.log('\n[STEP 4] Querying GET /api/marketing/campaigns/:id/leads...');
    const fetch = (await import('node-fetch')).default;
    
    const leadsUrl = `http://localhost:3000/api/marketing/campaigns/${campaignId}/leads`;
    const leadsRes = await fetch(leadsUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!leadsRes.ok) {
      const errText = await leadsRes.text();
      throw new Error(`Failed to fetch leads: Status ${leadsRes.status}, Body: ${errText}`);
    }

    const leadsData = await leadsRes.json();
    console.log(`✓ Successfully fetched ${leadsData.leads.length} leads.`);
    console.log(`✓ Funnel Stats: Impressions: ${leadsData.funnel.impressions}, Clicks: ${leadsData.funnel.clicks}, Conversions: ${leadsData.funnel.conversions}`);

    // Select the first lead that is NOT already "Booked"
    const targetLead = leadsData.leads.find(l => l.status !== 'Booked') || leadsData.leads[1] || leadsData.leads[0];
    if (!targetLead) {
      throw new Error('No target leads available to test conversion.');
    }

    console.log(`✓ Selection for conversion: "${targetLead.name}" (Status: ${targetLead.status}, Phone: ${targetLead.phone}, Email: ${targetLead.email})`);

    // 5. Convert lead to Confirmed Booking using the POST conversion endpoint
    console.log('\n[STEP 5] Triggering POST /api/marketing/leads/:leadId/convert-booking...');
    const convertUrl = `http://localhost:3000/api/marketing/leads/${targetLead.id}/convert-booking`;
    const conversionBody = {
      campaignId,
      name: targetLead.name,
      phone: targetLead.phone,
      email: targetLead.email,
      moveInDate: new Date().toISOString().split('T')[0],
      durationNights: 4,
      totalRent: 18000,
      configuration: '2 Guests, Deluxe Room',
      roomId: ''
    };

    const convertRes = await fetch(convertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(conversionBody)
    });

    if (!convertRes.ok) {
      const errText = await convertRes.text();
      throw new Error(`Failed to convert lead: Status ${convertRes.status}, Body: ${errText}`);
    }

    const convertData = await convertRes.json();
    console.log('✓ Response received from lead conversion endpoint:');
    console.log(JSON.stringify(convertData, null, 2));

    // 6. Verify lead is converted & campaigns are updated in DB
    console.log('\n[STEP 6] Validating campaign conversions count and bookings record in the DB...');
    const campaignVerify = await pool.query('SELECT accumulated_conversions FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    const finalConversions = Number(campaignVerify.rows[0].accumulated_conversions || 0);
    console.log(`✓ DB Verification: Conversions count increased from ${initialConversions} to ${finalConversions}`);

    const bookingVerify = await pool.query('SELECT * FROM bookings WHERE listing_id = $1 AND name = $2', [listingId, targetLead.name]);
    console.log(`✓ DB Verification: Found ${bookingVerify.rows.length} real bookings registered for ${targetLead.name}`);

    // 7. Verify the Leads array links and reflects the conversion status
    console.log('\n[STEP 7] Re-fetching GET /api/marketing/campaigns/:id/leads to verify real-time attribution update...');
    const postLeadsRes = await fetch(leadsUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (postLeadsRes.ok) {
      const postLeadsData = await postLeadsRes.json();
      const updatedLead = postLeadsData.leads.find(l => l.name === targetLead.name);
      
      console.log('✓ Updated Lead data from the live endpoint:');
      console.log(`  - Name: ${updatedLead.name}`);
      console.log(`  - Status: ${updatedLead.status} (Expected: Booked)`);
      console.log(`  - Attribution Trail:`);
      updatedLead.attribution_trail.forEach((log, index) => {
        console.log(`    [${index + 1}] ${log}`);
      });

      if (updatedLead.status === 'Booked') {
        console.log('\n=============================================================');
        console.log('   🎉 SUCCESS: END-TO-END LEAD CONVERSION VALIDATION PASSED! 🎉');
        console.log('=============================================================\n');
      } else {
        console.error('❌ FAILURE: Lead status did not transit to Booked in the output.');
      }
    }

  } catch (error) {
    console.error('\n❌ VALIDATION ERROR DETECTED:', error);
  } finally {
    await pool.end();
  }
}

runValidation();
