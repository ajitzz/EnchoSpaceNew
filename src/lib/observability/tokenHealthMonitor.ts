import { AlertService } from './alertService.js';
import pg from 'pg';

export class TokenHealthMonitor {
  private static readonly META_GRAPH_VERSION = 'v21.0';

  /**
   * Run the health monitor for Meta and Google API tokens.
   */
  public static async checkTokenHealth(pool: pg.Pool) {
    console.log('[TokenHealthMonitor] Initiating routine token health checks...');
    await this.checkMetaToken();
    await this.checkGoogleToken();
  }

  private static async checkMetaToken() {
    const metaToken = process.env.META_ACCESS_TOKEN;
    if (!metaToken) {
        console.warn('[TokenHealthMonitor] META_ACCESS_TOKEN not configured.');
        return;
    }

    try {
      // Endpoint to inspect token details in Meta Graph API
      const response = await fetch(`https://graph.facebook.com/${this.META_GRAPH_VERSION}/debug_token?input_token=${metaToken}&access_token=${metaToken}`);
      const data = await response.json() as any;

      if (!response.ok || !data.data || !data.data.is_valid) {
        AlertService.emitAlert(
          'TOKEN_EXPIRED',
          'CRITICAL',
          'Meta Access Token Invalid or Expired',
          `Graph API returned invalid for token: ${data.error?.message || 'Unknown Error'}`,
          'Platform Admins must immediately generate a new System User Token in Meta Business Settings.',
          { data }
        );
        return;
      }

      // Check Expiration
      if (data.data.expires_at) {
        const expiresAt = new Date(data.data.expires_at * 1000);
        const daysRemaining = (expiresAt.getTime() - Date.now()) / (1000 * 3600 * 24);
        
        if (daysRemaining <= 7) {
            AlertService.emitAlert(
                'TOKEN_EXPIRING_SOON',
                'HIGH',
                `Meta Token Expires in ${Math.round(daysRemaining)} Days`,
                `Token will expire on ${expiresAt.toISOString()}.`,
                'Rotate the System User Token in Meta Business Settings to prevent ad delivery pause.',
                { daysRemaining }
            );
        }
      }
      
      console.log(`[TokenHealthMonitor] Meta token health OK. Valid: ${data.data.is_valid}`);

    } catch (e: any) {
       console.error('[TokenHealthMonitor] Failed to check Meta token:', e.message);
    }
  }

  private static async checkGoogleToken() {
    const googleToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    if (!googleToken) {
        console.warn('[TokenHealthMonitor] GOOGLE_ADS_REFRESH_TOKEN not configured.');
        return;
    }

    // Checking Google token health usually involves attempting to fetch a new access token
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
          refresh_token: googleToken,
          grant_type: 'refresh_token'
        }).toString()
      });

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        AlertService.emitAlert(
          'TOKEN_EXPIRED',
          'CRITICAL',
          'Google Ads Refresh Token Invalid',
          `OAuth2 endpoint returned error: ${data.error_description || data.error}`,
          'Platform Admins must re-authenticate the application in Google Cloud Console.',
          { data }
        );
        return;
      }

      console.log('[TokenHealthMonitor] Google token health OK.');
    } catch (e: any) {
        console.error('[TokenHealthMonitor] Failed to check Google token:', e.message);
    }
  }
}
