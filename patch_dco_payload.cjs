const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetPayload = `      if (assetFeedImages.length > 0) {
          // Dynamic Creative Optimization (DCO) Payload
          creativePayload = {
            access_token: accessToken,
            name: \`Encho Dynamic Creative - \${adHeadline}\`,
            object_story_spec: { page_id: pageId },
            asset_feed_spec: {
              images: assetFeedImages,
              bodies: [{ text: adMessage }],
              titles: [{ text: adHeadline }],
              descriptions: [{ text: feedDescription }],
              call_to_action_types: ['SIGN_UP'], // Milestone 8.3: Lead Generation
              link_urls: [{ website_url: destinationUrl }]
            }
          };
          
          // Inject Lead Form ID if available for DCO
          if (campaign.meta_lead_form_id) {
             creativePayload.object_story_spec.link_data = {
                 call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: campaign.meta_lead_form_id } }
             };
          }`;

const newPayload = `      if (assetFeedImages.length > 0) {
          // Milestone 9.2: Dynamic Creative API Payload Structure (FAANG-Standard DCO Engine)
          // Dynamically constructs Meta's Asset Feed Spec using A/B testing variations for titles, bodies, and CTAs
          creativePayload = {
            access_token: accessToken,
            name: \`Encho DCO Master Engine - \${adHeadline}\`,
            object_story_spec: { page_id: pageId },
            asset_feed_spec: {
              images: assetFeedImages,
              bodies: [
                { text: adMessage }, // Primary AI generated body
                { text: \`Escape to \${campaign.listing_city || 'paradise'}. \${adMessage.substring(0, 100)}...\` } // Short-form variant
              ],
              titles: [
                { text: adHeadline }, // Primary Headline
                { text: \`Reserve \${adHeadline} Direct\` } // Direct booking angle
              ],
              descriptions: [
                { text: feedDescription },
                { text: 'Tap to view exclusive availability.' } // Urgency variant
              ],
              // DCO tests multiple CTAs automatically to find the highest converting button
              call_to_action_types: ['SIGN_UP', 'BOOK_TRAVEL', 'LEARN_MORE'],
              link_urls: [{ website_url: destinationUrl }]
            }
          };
          
          // Inject Lead Form ID if available for DCO
          // Meta API quirk: DCO with Lead Forms requires the CTA in link_data as well as the asset_feed_spec
          if (campaign.meta_lead_form_id) {
             creativePayload.object_story_spec.link_data = {
                 call_to_action: { type: 'SIGN_UP', value: { lead_gen_form_id: campaign.meta_lead_form_id } }
             };
          }`;

code = code.replace(targetPayload, newPayload);
fs.writeFileSync('server.ts', code);
console.log('Updated server.ts for DCO Payload');
