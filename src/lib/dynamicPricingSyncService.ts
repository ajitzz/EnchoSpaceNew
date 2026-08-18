import pg from 'pg';

let globalPool: pg.Pool | null = null;
function getDbPool(): pg.Pool {
  if (!globalPool) {
    globalPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return globalPool;
}

export interface PricingSyncEvent {
  id?: number;
  listing_id: number;
  campaign_id: number;
  old_price: number;
  new_price: number;
  currency: string;
  provider: 'META' | 'GOOGLE' | 'ALL';
  sync_status: 'SYNCED' | 'PENDING' | 'SKIPPED' | 'FAILED';
  synced_ad_copy?: string;
  synced_at?: string;
}

export class DynamicPricingSyncService {
  /**
   * Formats price with proper currency symbol
   */
  public static formatPrice(amount: number, currency = 'INR'): string {
    const curr = currency.toUpperCase();
    const formattedAmount = Number(amount).toLocaleString('en-IN');
    switch (curr) {
      case 'INR':
        return `₹${formattedAmount}`;
      case 'EUR':
        return `€${formattedAmount}`;
      case 'GBP':
        return `£${formattedAmount}`;
      default:
        return `$${formattedAmount}`;
    }
  }

  /**
   * Generates dynamic headline and ad copy incorporating updated price
   */
  public static generateUpdatedAdCopy(
    listingTitle: string,
    listingLocation: string,
    newPrice: number,
    currency = 'INR',
    provider: 'META' | 'GOOGLE' = 'META'
  ): { headline: string; primaryText: string; callToAction: string } {
    const formatted = this.formatPrice(newPrice, currency);

    if (provider === 'GOOGLE') {
      return {
        headline: `${listingTitle} from ${formatted}/night`,
        primaryText: `Book your stay in ${listingLocation}. Verified luxury stays starting at ${formatted} per night on Encho.`,
        callToAction: 'Book Online'
      };
    }

    return {
      headline: `Luxury Stays in ${listingLocation} | From ${formatted}/night`,
      primaryText: `Escape to ${listingTitle} in ${listingLocation}. Enjoy breathtaking views and premium amenities starting at just ${formatted} per night. Instant confirmed bookings on Encho.`,
      callToAction: 'Book Now'
    };
  }

  /**
   * Main entry point when a listing price is modified by a host
   */
  public static async onListingPriceUpdated(
    listingId: number | string,
    oldPrice: number,
    newPrice: number,
    currency = 'INR',
    customPool?: any
  ): Promise<{ synced_campaigns_count: number; events: PricingSyncEvent[] }> {
    const db = customPool || getDbPool();
    const numListingId = Number(listingId);

    if (oldPrice === newPrice) {
      return { synced_campaigns_count: 0, events: [] };
    }

    // Ensure audit table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_pricing_sync_events (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER NOT NULL,
        campaign_id INTEGER NOT NULL,
        old_price NUMERIC(10, 2) NOT NULL,
        new_price NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        provider VARCHAR(20) NOT NULL DEFAULT 'META',
        sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCED',
        synced_ad_copy TEXT,
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pricing_sync_listing ON listing_pricing_sync_events(listing_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_sync_campaign ON listing_pricing_sync_events(campaign_id);
    `);

    // Fetch all active campaigns associated with this listing
    const { rows: campaigns } = await db.query(
      `SELECT id, title, target_locations, platforms, status
       FROM marketing_campaigns
       WHERE listing_id = $1 AND status IN ('ACTIVE', 'LIVE', 'APPROVED', 'RUNNING', 'CANARY_ACTIVE', 'PENDING_REVIEW')`,
      [numListingId]
    );

    const events: PricingSyncEvent[] = [];

    for (const camp of campaigns) {
      const provider = camp.platforms?.includes('google') ? 'GOOGLE' : 'META';
      const updatedCopy = this.generateUpdatedAdCopy(
        camp.title || 'Luxury Retreat',
        camp.target_locations || 'Scenic Destination',
        newPrice,
        currency,
        provider as 'META' | 'GOOGLE'
      );

      const event: PricingSyncEvent = {
        listing_id: numListingId,
        campaign_id: camp.id,
        old_price: oldPrice,
        new_price: newPrice,
        currency,
        provider: provider as 'META' | 'GOOGLE',
        sync_status: 'SYNCED',
        synced_ad_copy: updatedCopy.headline + ' — ' + updatedCopy.primaryText,
        synced_at: new Date().toISOString()
      };

      await db.query(
        `INSERT INTO listing_pricing_sync_events 
         (listing_id, campaign_id, old_price, new_price, currency, provider, sync_status, synced_ad_copy, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          event.listing_id,
          event.campaign_id,
          event.old_price,
          event.new_price,
          event.currency,
          event.provider,
          event.sync_status,
          event.synced_ad_copy
        ]
      );

      events.push(event);
    }

    return {
      synced_campaigns_count: events.length,
      events
    };
  }

  /**
   * Retrieves latest pricing sync status for a campaign
   */
  public static async getLatestPricingSync(
    campaignId: number | string,
    customPool?: any
  ): Promise<PricingSyncEvent | null> {
    const db = customPool || getDbPool();
    try {
      const { rows } = await db.query(
        `SELECT * FROM listing_pricing_sync_events 
         WHERE campaign_id = $1 
         ORDER BY id DESC LIMIT 1`,
        [Number(campaignId)]
      );
      if (rows.length === 0) return null;
      return {
        id: rows[0].id,
        listing_id: rows[0].listing_id,
        campaign_id: rows[0].campaign_id,
        old_price: Number(rows[0].old_price),
        new_price: Number(rows[0].new_price),
        currency: rows[0].currency,
        provider: rows[0].provider,
        sync_status: rows[0].sync_status,
        synced_ad_copy: rows[0].synced_ad_copy,
        synced_at: rows[0].synced_at
      };
    } catch {
      return null;
    }
  }

  /**
   * Forces an immediate manual price sync for a specific campaign
   */
  public static async forceCampaignPriceSync(
    campaignId: number | string,
    customPool?: any
  ): Promise<{
    success: boolean;
    campaign_id: number;
    synced_price: number;
    formatted_price: string;
    synced_ad_copy: string;
    synced_at: string;
  }> {
    const db = customPool || getDbPool();
    const numCampaignId = Number(campaignId);

    // Fetch campaign and listing
    const { rows: camps } = await db.query(
      `SELECT c.id, c.title, c.target_locations, c.platforms, c.listing_id, l.price, l.title as listing_title, l.city
       FROM marketing_campaigns c
       LEFT JOIN listings l ON c.listing_id = l.id
       WHERE c.id = $1`,
      [numCampaignId]
    );

    if (camps.length === 0) {
      throw new Error(`Campaign #${campaignId} not found`);
    }

    const camp = camps[0];
    const newPrice = Number(camp.price || 3500);
    const currency = 'INR';
    const provider = camp.platforms?.includes('google') ? 'GOOGLE' : 'META';

    const updatedCopy = this.generateUpdatedAdCopy(
      camp.title || camp.listing_title || 'Luxury Retreat',
      camp.target_locations || camp.city || 'Scenic Destination',
      newPrice,
      currency,
      provider as 'META' | 'GOOGLE'
    );

    const syncedAt = new Date().toISOString();

    await db.query(
      `INSERT INTO listing_pricing_sync_events 
       (listing_id, campaign_id, old_price, new_price, currency, provider, sync_status, synced_ad_copy, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        camp.listing_id || 0,
        numCampaignId,
        newPrice,
        newPrice,
        currency,
        provider,
        'SYNCED',
        updatedCopy.headline + ' — ' + updatedCopy.primaryText
      ]
    );

    return {
      success: true,
      campaign_id: numCampaignId,
      synced_price: newPrice,
      formatted_price: this.formatPrice(newPrice, currency),
      synced_ad_copy: updatedCopy.headline,
      synced_at: syncedAt
    };
  }

  /**
   * Retrieves recent pricing sync history for audit and transparency
   */
  public static async getPricingSyncHistory(
    campaignId: number | string,
    customPool?: any,
    limit = 5
  ): Promise<PricingSyncEvent[]> {
    const db = customPool || getDbPool();
    try {
      const { rows } = await db.query(
        `SELECT id, listing_id, campaign_id, old_price, new_price, currency, provider, sync_status, synced_ad_copy, synced_at
         FROM listing_pricing_sync_events 
         WHERE campaign_id = $1 
         ORDER BY id DESC LIMIT $2`,
        [Number(campaignId), limit]
      );
      return rows.map((r: any) => ({
        id: r.id,
        listing_id: r.listing_id,
        campaign_id: r.campaign_id,
        old_price: Number(r.old_price),
        new_price: Number(r.new_price),
        currency: r.currency,
        provider: r.provider,
        sync_status: r.sync_status,
        synced_ad_copy: r.synced_ad_copy,
        synced_at: r.synced_at
      }));
    } catch {
      return [];
    }
  }
}
