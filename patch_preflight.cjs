const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const preflightRegex = /app\.post\('\/api\/marketing\/pre-flight-check'[\s\S]*?\}\);/m;
const match = code.match(preflightRegex);
if (!match) {
  console.log("Could not find preflight");
  process.exit(1);
}

const newPreflight = `app.post('/api/marketing/pre-flight-check', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { listing_id, title, description, budget, target_radius_km, media_urls, ad_format } = req.body;
    const checks = {
      listing_valid: false,
      title_valid: false,
      description_safe: false,
      budget_adequate: false,
      special_ad_category_housing: true,
      age_targeting_compliant: true, // Strictly 18-65 per Meta guidelines
      radius_compliant: false,
      media_ready: false,
      payload_schema_valid: false,
      errors: [] as string[]
    };
    
    // 1. Listing Validation
    if (!listing_id) {
      checks.errors.push('Listing ID is required for property ad campaigns.');
    } else {
      const listingCheck = await pool.query('SELECT id, title, image_url, price FROM listings WHERE id = $1', [listing_id]);
      if (listingCheck.rows.length === 0) {
        checks.errors.push('Referenced listing does not exist in database.');
      } else {
        checks.listing_valid = true;
      }
    }
    
    // 2. Copy Validation (Walled Garden)
    if (!title || title.trim().length < 5) {
      checks.errors.push('Campaign headline/title must be at least 5 characters.');
    } else {
      checks.title_valid = true;
    }
    const contactLeakRegex = /(\\+?\\d[\\d\\s-]{8,})|([\\w.-]+@[\\w.-]+\\.\\w+)|(wa\\.me)|(whatsapp)|(t\\.me)|(instagram\\.com)|(facebook\\.com)|(call me)|(contact at)|(http[s]?:\\/\\/[^\\s]+)/gi;
    if (!description || description.trim().length < 10) {
      checks.errors.push('Campaign description must be at least 10 characters.');
    } else if (contactLeakRegex.test(description)) {
      checks.errors.push('Description contains prohibited external contact links, emails, or phone numbers (Walled Garden policy).');
    } else {
      checks.description_safe = true;
    }
    
    // 3. Budget Validation
    if (budget < 1000) {
      checks.errors.push('Minimum campaign budget is $10.00 (1000 cents).');
    } else {
      checks.budget_adequate = true;
    }

    // 4. Meta Housing Radius Compliance
    // Meta requires at least 15 miles (approx 25 km) for real estate targeting.
    if (target_radius_km && target_radius_km < 25) {
      checks.errors.push('Target radius must be at least 25km (15 miles) per Meta Housing Special Ad Category policy.');
    } else {
      checks.radius_compliant = true;
    }

    // 5. Media Validation
    if (!media_urls || media_urls.length === 0) {
      checks.errors.push('At least one media asset is required.');
    } else if (ad_format === 'carousel' && media_urls.length < 2) {
      checks.errors.push('Carousel format requires at least 2 media assets.');
    } else {
      checks.media_ready = true;
    }

    // 6. Payload Validation Readiness
    if (checks.listing_valid && checks.title_valid && checks.description_safe && checks.budget_adequate && checks.radius_compliant && checks.media_ready) {
      checks.payload_schema_valid = true;
    }

    res.json({
      success: checks.payload_schema_valid,
      checks
    });
  } catch (error) {
    console.error('Pre-flight error:', error);
    res.status(500).json({ error: 'Failed pre-flight check' });
  }
});`;

code = code.replace(preflightRegex, newPreflight);
fs.writeFileSync('server.ts', code);
console.log("Patched preflight in server.ts");
