import pg from 'pg';
import { googleAdsClient } from './GoogleAdsClient.js';

export interface OfflineConversion {
  bookingId: string;
  gclid?: string;
  gbraid?: string;
  conversionActionId: string;
  conversionValue: number;
  conversionTime: string; // YYYY-MM-DD HH:MM:SS+HH:MM
}

export class GoogleOfflineConversions {
  private pool: pg.Pool;

  constructor() {
    this.pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Uploads offline conversions directly to Google Ads.
   * This ties the direct booking value back to the Ad Click.
   */
  public async uploadConversions(customerId: string, conversions: OfflineConversion[]): Promise<void> {

    const clickConversions = conversions.map(conv => {
      const clickConversion: any = {
        conversionAction: `customers/${customerId}/conversionActions/${conv.conversionActionId}`,
        conversionDateTime: conv.conversionTime,
        conversionValue: conv.conversionValue,
        currencyCode: 'INR',
      };

      if (conv.gclid) {
        clickConversion.gclid = conv.gclid;
      }
      if (conv.gbraid) {
        clickConversion.gbraid = conv.gbraid;
      }

      return clickConversion;
    });

    try {
      const response = await googleAdsClient.uploadClickConversions(customerId, clickConversions);
      
      console.log(`[GoogleOfflineConversions] Uploaded ${conversions.length} conversions for Customer ${customerId}`, response);
      
      // Update DB to mark as uploaded
      for (const conv of conversions) {
        await this.pool.query(
          `UPDATE bookings SET google_conversion_uploaded = true WHERE id = $1`,
          [conv.bookingId]
        );
      }
    } catch (error: any) {
      console.error('[GoogleOfflineConversions] Error uploading click conversions:', error);
      throw error;
    }
  }

  /**
   * Background task to find bookings with un-uploaded gclid/gbraid and sync them.
   */
  public async syncPendingConversions(customerId: string, conversionActionId: string): Promise<void> {
    const pending = await this.pool.query(`
      SELECT id, total_rent, created_at, gclid, gbraid
      FROM bookings 
      WHERE (gclid IS NOT NULL OR gbraid IS NOT NULL) 
      AND (google_conversion_uploaded = false OR google_conversion_uploaded IS NULL)
      AND status = 'CONFIRMED'
    `);

    if (pending.rows.length === 0) return;

    const conversions: OfflineConversion[] = pending.rows.map(row => ({
      bookingId: row.id,
      gclid: row.gclid,
      gbraid: row.gbraid,
      conversionActionId,
      conversionValue: parseFloat(row.total_rent || '0'),
      // Format: yyyy-mm-dd hh:mm:ss+|-hh:mm
      conversionTime: new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19) + '+00:00',
    }));

    await this.uploadConversions(customerId, conversions);
  }
}

export const googleOfflineConversions = new GoogleOfflineConversions();
