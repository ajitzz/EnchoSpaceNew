import { Router, type Request, type Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import {
  FeederCorridorService,
  godmodeTargetingInputSchema,
  customGeoRadiusSchema,
} from '../../services/feederCorridorService.js';

export function createFeederCorridorRouter(pool: pg.Pool): Router {
  const router = Router();
  const service = new FeederCorridorService(pool);

  // 1. GET /corridors: List available standardized feeder corridors
  router.get('/corridors', async (req: Request, res: Response) => {
    try {
      const region = typeof req.query.region === 'string' ? req.query.region : undefined;
      const tier = typeof req.query.tier === 'string' ? req.query.tier : undefined;

      const corridors = await service.listAvailableCorridors(region, tier);
      return res.json({
        success: true,
        corridors,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list feeder corridors' });
    }
  });

  // 2. POST /recommend: AI Advisory Copilot endpoint for optimal campaign targeting
  const recommendSchema = z.object({
    listingId: z.number().int().positive().optional(),
    title: z.string().optional(),
    price: z.number().min(0).optional(),
    city: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    budgetCents: z.number().min(1000).default(700000), // Default ₹7,000 budget
    platform: z.enum(['META', 'GOOGLE', 'OMNICHANNEL']).default('OMNICHANNEL'),
  });

  router.post('/recommend', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const parsed = recommendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid recommendation request', details: parsed.error.format() });
      }

      let property = {
        id: parsed.data.listingId,
        title: parsed.data.title || 'Luxury Resort Stay',
        price: parsed.data.price || 12000,
        city: parsed.data.city || 'Wayanad',
        amenities: parsed.data.amenities || [],
      };

      if (parsed.data.listingId) {
        const listingRes = await pool.query(
          'SELECT id, title, price, city, amenities FROM listings WHERE id = $1',
          [parsed.data.listingId]
        );
        if (listingRes.rows.length > 0) {
          const row = listingRes.rows[0];
          property = {
            id: row.id,
            title: row.title,
            price: Number(row.price),
            city: row.city || 'Wayanad',
            amenities: Array.isArray(row.amenities) ? row.amenities : [],
          };
        }
      }

      const recommendation = await service.generateAiCopilotRecommendation(
        property,
        parsed.data.budgetCents,
        parsed.data.platform
      );

      return res.json({
        success: true,
        recommendation,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to generate AI targeting recommendation' });
    }
  });

  // 3. POST /validate-formula: Mathematical validation of feeder targeting formula
  const validateFormulaSchema = z.object({
    corridorIds: z.array(z.string()).default([]),
    customRadii: z.array(customGeoRadiusSchema).default([]),
    excludedDistricts: z.array(z.string()).default([]),
  });

  router.post('/validate-formula', async (req: Request, res: Response) => {
    try {
      const parsed = validateFormulaSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: parsed.error.format() });
      }

      const allCorridors = await service.listAvailableCorridors();
      const selectedCorridors = allCorridors.filter((c) => parsed.data.corridorIds.includes(c.id));

      const resolution = service.calculateCorridorTargetingFormula(
        selectedCorridors,
        parsed.data.customRadii,
        parsed.data.excludedDistricts
      );

      return res.json({
        success: resolution.isValid,
        resolution,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Formula validation failed' });
    }
  });

  // 4. GET /campaigns/:id/targeting: Fetch campaign God-Mode targeting
  router.get('/campaigns/:id/targeting', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const campaignId = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(campaignId)) {
        return res.status(400).json({ error: 'Invalid campaign ID' });
      }

      // Verify campaign access
      const campResult = await pool.query(
        'SELECT id, host_user_id FROM host_marketing_campaigns WHERE id = $1',
        [campaignId]
      );

      if (campResult.rows.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campResult.rows[0];
      if (user.role !== 'admin' && Number(campaign.host_user_id) !== Number(user.id)) {
        return res.status(403).json({ error: 'Access denied to this campaign targeting' });
      }

      const targeting = await service.getGodmodeTargeting(campaignId);
      return res.json({
        success: true,
        targeting,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch campaign targeting' });
    }
  });

  // 5. POST /campaigns/:id/targeting: Save/Update campaign God-Mode targeting (Admin only)
  router.post('/campaigns/:id/targeting', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin authority required to configure God-Mode targeting parameters' });
      }

      const campaignId = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      if (isNaN(campaignId)) {
        return res.status(400).json({ error: 'Invalid campaign ID' });
      }

      const result = await service.saveGodmodeTargeting(campaignId, req.body, Number(user.id));

      return res.json({
        ...result,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('CAMPAIGN_NOT_FOUND') ? 404 : 400;
      return res.status(statusCode).json({ error: err.message || 'Failed to save God-Mode targeting' });
    }
  });

  return router;
}
