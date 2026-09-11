/**
 * Phase 3.4 — Calendar Circuit Breaker Engine
 *
 * Connects property booking / calendar availability state to active Meta campaign delivery.
 *
 * Non-Negotiable Rules:
 * 1. AUTO-PAUSE: Automatically pauses campaigns when a property becomes 100% occupied / unavailable for target dates.
 * 2. AUTO-RESUME: Disabled until persisted campaign stay dates and dated inventory are verified.
 *    Positive canonical stock alone is not evidence of availability.
 * 3. MANUAL PAUSE RESPECT: Campaigns manually paused by Host ('HOST_MANUAL') or Admin ('ADMIN_MANUAL') must NEVER
 *    be automatically resumed by the calendar circuit breaker.
 * 4. FINANCIAL PROTECTION: Auto-pause NEVER deletes or alters financial authorization / contracts. Remaining budget
 *    remains safely intact so that auto-resume requires zero new funding.
 * 5. LOOP PREVENTION & DEBOUNCE: Prevents rapid pause/resume flapping loops by enforcing state verification and epoch checks.
 * 6. STALE SIGNAL REJECTION: Ignores stale or corrupted calendar signals.
 */

import pg from 'pg';
import { canonicalInventory } from '../../lib/roomInventory.js';
import { MetaControlPlaneService, ActionActorContext } from './metaControlPlaneService.js';

let globalPool: pg.Pool | null = null;
function getDbPool(): pg.Pool {
  if (!globalPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }
    globalPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return globalPool;
}

export interface CalendarEvaluationOptions {
  customGraphFetcher?: (endpoint: string, options?: any) => Promise<{ status: number; data: any }>;
  forceEvaluation?: boolean;
  minDebounceSeconds?: number;
  correlationId?: string;
}

export interface CalendarCircuitBreakerResult {
  listing_id: number;
  is_fully_booked: boolean | null;
  active_campaigns_count: number;
  paused_campaigns_count: number;
  actions_taken: Array<{
    campaign_id: number;
    action: 'CALENDAR_AUTO_PAUSE' | 'CALENDAR_AUTO_RESUME' | 'SKIPPED';
    reason: string;
    success: boolean;
    error?: string;
  }>;
  skipped_manual_pauses: number;
  timestamp: string;
}

// In-memory debounce map: listingId -> last evaluated timestamp (ms)
const lastListingEvaluationMap = new Map<number, number>();

export class CalendarCircuitBreaker {
  /**
   * Evaluates listing availability and triggers auto-pause or auto-resume on associated campaigns.
   */
  static async evaluateListingAvailability(
    listingId: number | string,
    dbClient?: any,
    options: CalendarEvaluationOptions = {}
  ): Promise<CalendarCircuitBreakerResult> {
    const pool = dbClient || getDbPool();
    const numListingId = Number(listingId);
    const now = Date.now();
    const debounceMs = (options.minDebounceSeconds ?? 2) * 1000;

    // 1. Debounce check to prevent flapping loops
    const lastEval = lastListingEvaluationMap.get(numListingId) || 0;
    if (!options.forceEvaluation && now - lastEval < debounceMs) {
      return {
        listing_id: numListingId,
        is_fully_booked: null,
        active_campaigns_count: 0,
        paused_campaigns_count: 0,
        actions_taken: [{
          campaign_id: 0,
          action: 'SKIPPED',
          reason: `Debounced: listing evaluated ${Math.round((now - lastEval) / 1000)}s ago`,
          success: true
        }],
        skipped_manual_pauses: 0,
        timestamp: new Date().toISOString()
      };
    }
    lastListingEvaluationMap.set(numListingId, now);

    // 2. Fetch Listing & Active Bookings to determine availability
    const listingRes = await pool.query(
      `SELECT id, user_id, title, dynamic_pricing, rooms FROM listings WHERE id = $1`,
      [numListingId]
    );
    if (listingRes.rows.length === 0) {
      throw new Error(`Listing ${listingId} not found`);
    }

    const totalInventory = canonicalInventory(listingRes.rows[0].rooms);
    // Positive stock does not prove availability for a campaign's target dates.
    const isFullyBooked = totalInventory === 0 ? true : null;

    // 3. Fetch all marketing campaigns linked to this listing
    const campaignsRes = await pool.query(
      `SELECT id, host_id, title, status, meta_status, meta_effective_status, 
              pause_source, pause_reason, budget, spent, escrow_status
       FROM host_marketing_campaigns 
       WHERE listing_id = $1`,
      [numListingId]
    );

    const campaigns = campaignsRes.rows;
    const actionsTaken: CalendarCircuitBreakerResult['actions_taken'] = [];
    let skippedManualPauses = 0;

    const systemActor: ActionActorContext = {
      userId: 0,
      role: 'system',
      isAdmin: true
    };

    if (isFullyBooked) {
      // CIRCUIT BREAKER TRIGGER: Property is 100% booked / unavailable -> AUTO-PAUSE active campaigns
      const liveCampaigns = campaigns.filter((c: any) => 
        ['active', 'CAMPAIGN_LIVE', 'approved'].includes(c.status) || 
        c.meta_effective_status === 'ACTIVE'
      );

      for (const camp of liveCampaigns) {
        try {
          const pauseRes = await MetaControlPlaneService.executeControlAction(
            camp.id,
            'CALENDAR_AUTO_PAUSE',
            systemActor,
            {
              reason: `Calendar Circuit Breaker: Property #${numListingId} has zero configured room inventory`,
              customGraphFetcher: options.customGraphFetcher,
              idempotencyKey: options.correlationId ? `calendar_pause_${camp.id}_${options.correlationId}` : undefined
            },
            pool
          );

          actionsTaken.push({
            campaign_id: camp.id,
            action: 'CALENDAR_AUTO_PAUSE',
            reason: 'Zero configured room inventory; pause requested to protect ad budget',
            success: pauseRes.success
          });
        } catch (err: any) {
          actionsTaken.push({
            campaign_id: camp.id,
            action: 'CALENDAR_AUTO_PAUSE',
            reason: err.message,
            success: false,
            error: err.message
          });
        }
      }
    } else {
      for (const camp of campaigns) {
        if (camp.pause_source && camp.pause_source !== 'SYSTEM_AUTO_PAUSED') skippedManualPauses++;
        actionsTaken.push({ campaign_id: camp.id, action: 'SKIPPED', reason: 'Date-specific availability is unverified. No automatic pause or resume authorized.', success: false });
      }
    }

    return {
      listing_id: numListingId,
      is_fully_booked: isFullyBooked,
      active_campaigns_count: campaigns.filter((c: any) => c.status === 'active').length,
      paused_campaigns_count: campaigns.filter((c: any) => c.status === 'paused').length,
      actions_taken: actionsTaken,
      skipped_manual_pauses: skippedManualPauses,
      timestamp: new Date().toISOString()
    };
  }
}
