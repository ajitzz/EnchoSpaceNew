const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetCheckQuery = `    const check = await pool.query(\`
      SELECT c.*, l.title as listing_title 
      FROM host_marketing_campaigns c 
      JOIN listings l ON c.listing_id = l.id 
      WHERE c.id = $1 AND c.host_id = $2
    \`, [id, req.user?.id]);`;

const newCheckQuery = `    const check = await pool.query(\`
      SELECT c.*, l.title as listing_title, l.city, l.currency
      FROM host_marketing_campaigns c 
      JOIN listings l ON c.listing_id = l.id 
      WHERE c.id = $1 AND c.host_id = $2
    \`, [id, req.user?.id]);`;

code = code.replace(targetCheckQuery, newCheckQuery);

const targetGatewayLogic = `    const campaign = check.rows[0];
    const selectedGateway = gateway || 'stripe';
    const finalAmount = amount || campaign.budget || 2500;`;

const newGatewayLogic = `    const campaign = check.rows[0];
    
    // Milestone 8.4: Hybrid Payment Geo-Router
    let detectedRegion = 'international';
    let enforcedGateway = 'stripe';
    
    const indianCities = ['Mumbai', 'Delhi NCR', 'Bangalore', 'Pune', 'Goa', 'Jaipur', 'Udaipur', 'Kochi', 'Delhi', 'Chennai', 'Kolkata'];
    if (campaign.currency === 'INR' || (campaign.city && indianCities.some(c => campaign.city.toLowerCase().includes(c.toLowerCase())))) {
        detectedRegion = 'india';
        enforcedGateway = 'razorpay';
    }
    
    const selectedGateway = (gateway === 'internal_wallet') ? 'internal_wallet' : enforcedGateway;
    const finalAmount = amount || campaign.budget || 2500;
    const optimizationFee = Math.round((finalAmount * 0.15) * 100) / 100;
    const adSpendPool = Math.round((finalAmount * 0.85) * 100) / 100;
    console.log(\`[GEO-ROUTER] Detected region: \${detectedRegion.toUpperCase()}. Routing payment to: \${enforcedGateway.toUpperCase()}.\`);
    console.log(\`[FEE SPLIT] Total: \${finalAmount} | Ad Spend: \${adSpendPool} | Encho Optimization Fee: \${optimizationFee}\`);`;

code = code.replace(targetGatewayLogic, newGatewayLogic);

fs.writeFileSync('server.ts', code);
console.log('Updated subscribe route geo-router logic');
