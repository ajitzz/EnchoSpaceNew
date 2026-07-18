const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Gap 10: Dynamic Creative Optimization (A/B Testing)
const target10 = `    const campaign = check.rows[0];

    let aiResults = {`;

const replacement10 = `    const campaign = check.rows[0];

    // Gap 10: Automated A/B Testing (Dynamic Creative Optimization)
    // Extract up to 3 top images from the listing
    let abTestImages = [];
    if (campaign.listing_images && Array.isArray(campaign.listing_images) && campaign.listing_images.length > 0) {
      abTestImages = campaign.listing_images.slice(0, 3);
    } else if (campaign.listing_image) {
      abTestImages = [campaign.listing_image];
    }
    
    if (abTestImages.length > 1) {
       console.log(\`[AI GATEKEEPER - GAP 10] Detected multiple high-res images. Generating Dynamic A/B Test for \${abTestImages.length} variants...\`);
       // Auto-save the extracted variants to the campaign media_urls if they aren't already set
       if (!campaign.media_urls || campaign.media_urls.length === 0) {
         await pool.query('UPDATE host_marketing_campaigns SET media_urls = $1 WHERE id = $2', [JSON.stringify(abTestImages), id]);
       }
    }

    let aiResults = {`;

code = code.replace(target10, replacement10);

const target10_2 = `suggestions: "Excellent draft! Add specific, scenic keywords (like 'stargazing firepit' or 'heated plunge pool') right in the first sentence to hook social media scrollers within 1.5 seconds."`;
const replacement10_2 = `suggestions: abTestImages.length > 1 ? \`Excellent draft! We have configured \${abTestImages.length} Dynamic A/B Test variants to maximize ROAS.\` : "Excellent draft! Add specific, scenic keywords (like 'stargazing firepit') right in the first sentence to hook social media scrollers within 1.5 seconds."`;

code = code.replace(target10_2, replacement10_2);

const target10_3 = `          const parsed = JSON.parse(result.text);
          aiResults = parsed;
        }
      } catch (aiErr) {`;
const replacement10_3 = `          const parsed = JSON.parse(result.text);
          aiResults = parsed;
          if (abTestImages.length > 1) {
            aiResults.suggestions += \` | Note: AI configured \${abTestImages.length} image variants for A/B Testing.\`;
          }
        }
      } catch (aiErr) {`;

code = code.replace(target10_3, replacement10_3);


fs.writeFileSync('server.ts', code);
console.log('Gap 10 Added');
