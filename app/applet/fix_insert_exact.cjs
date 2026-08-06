const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetBlock = `    const result = await pool.query(\`
      INSERT INTO host_marketing_campaigns 
      (host_id, listing_id, title, description, video_url, media_urls, platforms, budget, status, target_locations, target_radius_km, ad_format, feed_description, rejected_fields, meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label, target_audience_persona, audience_interests, ai_generated_ad_copies, target_locations_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, '{}'::jsonb, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    \], [
      req.user?.id,
      listing_id,
      title,
      description,
      video_url || null,
      JSON.stringify(media_urls || []),
      JSON.stringify(platforms || []),
      budget || 2500,
      target_locations || null,
      target_radius_km || 50,
      ad_format || 'post',
      feed_description || null,
      meta_pixel_id || null,
      meta_capi_token || null,
      google_conversion_id || null,
      google_conversion_label || null,
      target_audience_persona || 'everyone',
      JSON.stringify(audience_interests || []),
      JSON.stringify(ai_generated_ad_copies || {})
    ]);`;

const replacementBlock = `    const result = await pool.query(\`
      INSERT INTO host_marketing_campaigns 
      (host_id, listing_id, title, description, video_url, media_urls, platforms, budget, status, target_locations, target_radius_km, ad_format, feed_description, rejected_fields, meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label, target_audience_persona, audience_interests, ai_generated_ad_copies, target_locations_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, '{}'::jsonb, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    \], [
      req.user?.id,
      listing_id,
      title,
      description,
      video_url || null,
      JSON.stringify(media_urls || []),
      JSON.stringify(platforms || []),
      budget || 2500,
      target_locations || null,
      target_radius_km || 50,
      ad_format || 'post',
      feed_description || null,
      meta_pixel_id || null,
      meta_capi_token || null,
      google_conversion_id || null,
      google_conversion_label || null,
      target_audience_persona || 'everyone',
      JSON.stringify(audience_interests || []),
      JSON.stringify(ai_generated_ad_copies || {}),
      JSON.stringify(target_locations ? target_locations.split(',').map(s => s.trim()) : [])
    ]);`;

if (code.includes(targetBlock)) {
    code = code.replace(targetBlock, replacementBlock);
    fs.writeFileSync('server.ts', code);
    console.log('Successfully fixed campaign insert with 20 parameters!');
} else {
    console.error('Target block not found!');
}
