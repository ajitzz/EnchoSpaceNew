const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add Zod Import
if (!code.includes('import { z } from "zod";')) {
  code = code.replace("import express from 'express';", "import express from 'express';\nimport { z } from 'zod';");
}

// 2. Define Zod Schemas
const zodSchemas = `
// ==========================================
// PHASE 4: SECURITY & VALIDATION SCHEMAS
// ==========================================
const campaignSchema = z.object({
  listing_id: z.number().int().positive(),
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  video_url: z.string().url().optional().or(z.literal('')),
  media_urls: z.array(z.string().url()).optional(),
  platforms: z.array(z.enum(['meta', 'google'])),
  budget: z.number().min(5),
  target_locations: z.string().optional(),
  ad_format: z.string().optional(),
  feed_description: z.string().optional(),
  meta_pixel_id: z.string().optional(),
  meta_capi_token: z.string().optional(),
  google_conversion_id: z.string().optional(),
  google_conversion_label: z.string().optional()
});

const campaignUpdateSchema = campaignSchema.partial().extend({
  status: z.enum(['draft', 'pending', 'active', 'paused', 'completed', 'rejected']).optional(),
  rejected_fields: z.any().optional()
});

const walletRefuelSchema = z.object({
  amount: z.number().min(10).max(10000),
  gateway: z.enum(['stripe', 'razorpay'])
});
`;

if (!code.includes('const campaignSchema')) {
  code = code.replace("const app = express();", zodSchemas + "\nconst app = express();");
}

// 3. Inject validation into routes
const createCampaignOriginal = `    const { listing_id, title, description, video_url, media_urls, platforms, budget, target_locations, ad_format, feed_description, meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label } = req.body;

    if (!listing_id || !title || !description) {
      return res.status(400).json({ error: 'listing_id, title, and description are required' });
    }`;

const createCampaignZod = `    const parseResult = campaignSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.errors });
    }
    const { listing_id, title, description, video_url, media_urls, platforms, budget, target_locations, ad_format, feed_description, meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label } = parseResult.data;`;

code = code.replace(createCampaignOriginal, createCampaignZod);


const updateCampaignOriginal = `    const { title, description, video_url, media_urls, platforms, budget, status, target_locations, ad_format, feed_description, rejected_fields, meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label } = req.body;`;

const updateCampaignZod = `    const parseResult = campaignUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.errors });
    }
    const { title, description, video_url, media_urls, platforms, budget, status, target_locations, ad_format, feed_description, rejected_fields, meta_pixel_id, meta_capi_token, google_conversion_id, google_conversion_label } = parseResult.data;`;

code = code.replace(updateCampaignOriginal, updateCampaignZod);

fs.writeFileSync('server.ts', code);
console.log('Phase 4.1 Zod validation injected successfully.');
