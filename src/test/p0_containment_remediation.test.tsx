import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import app, { dispatchGoogleAdsCampaign } from '../../server';
import { CheckoutPage, isProductionEnvironment } from '../../components/CheckoutPage';
import { Listing } from '../../types';

describe('P0 Emergency Containment Regression Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Production Stay Order Creation & Verification Fail-Closed (HTTP 503)', () => {
    it('returns HTTP 503 and blocks stay order creation in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/checkout/razorpay/order')
        .send({
          listingId: 42,
          moveInDate: '2026-10-01',
          checkOutDate: '2026-10-03',
          name: 'Traveler Jane',
          phone: '+91 9876543210'
        });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE');
      expect(res.body.error).toContain('statutory compliance review');
      expect(res.body.order_id).toBeUndefined();
    });

    it('returns HTTP 503 and refuses client payment verification for stays in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/payments/razorpay/verify')
        .send({
          booking_id: 999,
          razorpay_order_id: 'order_test_123',
          razorpay_payment_id: 'pay_test_123',
          razorpay_signature: 'sim_sig_fake_signature'
        });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('STAYS_CHECKOUT_UNAVAILABLE_COMPLIANCE_GATE');
      expect(res.body.error).toContain('disabled in production');
      expect(res.body.success).toBeUndefined();
    });
  });

  describe('2. Client Render Fail-Closed Gate & Honest Compliance State', () => {
    const mockListing: Listing = {
      id: '42',
      user_id: 1001,
      title: 'Serene Foothills Villa',
      description: 'Private mountain sanctuary',
      type: 'resort',
      rental_mode: 'entire_place',
      price: 15000,
      currency: 'INR',
      publication_status: 'published',
      address: '100 Ridge Road',
      city: 'Coorg',
      lat: 12.33,
      lng: 75.80,
      imageUrl: 'https://images.encho.space/villa.jpg',
      imageUrls: ['https://images.encho.space/villa.jpg'],
      imageCount: 1,
      isVerified: true,
      rooms: [
        {
          id: 'room_1',
          name: 'Panorama Suite',
          type: 'suites',
          price: 15000,
          capacity: 2,
          inventory_count: 3
        }
      ],
      amenities: ['wifi', 'pool'],
      created_at: new Date().toISOString()
    };

    it('renders ONLY honest compliance-unavailable state in production for stays', () => {
      process.env.NODE_ENV = 'production';
      expect(isProductionEnvironment()).toBe(true);

      const html = renderToStaticMarkup(
        <CheckoutPage
          listing={mockListing}
          initialData={{
            moveInDate: '2026-10-01',
            checkOutDate: '2026-10-04',
            configuration: 'Panorama Suite',
            name: 'Jane Doe',
            phone: '9876543210'
          }}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Must render honest compliance gate
      expect(html).toContain('data-testid="stays-compliance-gate"');
      expect(html).toContain('Statutory Compliance Gate');
      expect(html).toContain('Online Stays Checkout Unavailable');
      expect(html).toContain('503 Service Unavailable');
      expect(html).toContain('Return to Property');

      // Must NOT contain payment, QR, UPI, mock-signature, guest commission, or hardcoded GST text
      expect(html).not.toContain('encho.space@icici');
      expect(html).not.toContain('@icici');
      expect(html).not.toContain('rzp_sig_');
      expect(html).not.toContain('sim_sig_');
      expect(html).not.toContain('Concierge &amp; Escrow Protection (15%)');
      expect(html).not.toContain('Concierge & Escrow Protection (15%)');
      expect(html).not.toContain('Statutory GST (18%)');
      expect(html).not.toContain('Pay with Razorpay Gateway');
      expect(html).not.toContain('Instant Auto-QR Sync');
      expect(html).not.toContain('Pay &amp; Lock');
      expect(html).not.toContain('Pay & Lock');
      expect(html).not.toContain('Scan &amp; Pay via UPI');
      expect(html).not.toContain('Scan & Pay via UPI');
    });

    it('does not calculate or render client-side 15% commission or 18% GST in development', () => {
      process.env.NODE_ENV = 'development';

      const html = renderToStaticMarkup(
        <CheckoutPage
          listing={mockListing}
          initialData={{
            moveInDate: '2026-10-01',
            checkOutDate: '2026-10-04',
            configuration: 'Panorama Suite',
            name: 'Jane Doe',
            phone: '9876543210'
          }}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(html).not.toContain('Concierge &amp; Escrow Protection (15%)');
      expect(html).not.toContain('Concierge & Escrow Protection (15%)');
      expect(html).not.toContain('Statutory GST (18%)');
      expect(html).not.toContain('encho.space@icici');
      expect(html).not.toContain('rzp_sig_');
      expect(html).not.toContain('sim_sig_');
    });
  });

  describe('3. Exact Production CORS Allowlist Enforcement', () => {
    it('accepts exact canonical production domain https://encho.space', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/health/live')
        .set('Origin', 'https://encho.space');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://encho.space');
    });

    it('accepts exact canonical production domain https://www.encho.space', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/health/live')
        .set('Origin', 'https://www.encho.space');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://www.encho.space');
    });

    it('accepts explicitly configured origin in ALLOWED_ORIGINS', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = 'https://staging.encho.space, https://admin.encho.space';

      const res = await request(app)
        .get('/api/health/live')
        .set('Origin', 'https://staging.encho.space');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://staging.encho.space');
    });

    it('rejects arbitrary *.vercel.app domain in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/health/live')
        .set('Origin', 'https://unauthorized-attacker.vercel.app');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Blocked by CORS policy');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects untrusted external origin in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/health/live')
        .set('Origin', 'https://evil-phishing-portal.com');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Blocked by CORS policy');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('preserves localhost compatibility in local development', async () => {
      process.env.NODE_ENV = 'development';

      const res = await request(app)
        .get('/api/health/live')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('4. Unconditional Production Clickjacking & CSP Headers', () => {
    it('enforces SAMEORIGIN and frame-ancestors self in production unconditionally', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ENABLE_PREVIEW_EMBED;

      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    });

    it('prohibits ENABLE_PREVIEW_EMBED from relaxing clickjacking in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_PREVIEW_EMBED = 'true';

      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      // Unconditional: must remain SAMEORIGIN and 'self' even when ENABLE_PREVIEW_EMBED=true
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
      expect(res.headers['content-security-policy']).not.toContain("frame-ancestors *");
    });
  });

  describe('5. Unconditional Google Ads Containment Gate', () => {
    it('always fails closed with audited disabled result even if ENABLE_GOOGLE_ADS_DISPATCH=true', async () => {
      process.env.ENABLE_GOOGLE_ADS_DISPATCH = 'true';

      const result = await dispatchGoogleAdsCampaign(101);

      expect(result.dispatched).toBe(false);
      expect(result.reason).toContain('GOOGLE_ADS_CONTAINMENT_LOCKED');
      expect(result.reason).toContain('Decision #3');
      expect(result.reason).toContain('Requires future Google Ads v25 milestone');
    });

    it('fails closed when ENABLE_GOOGLE_ADS_DISPATCH is unset or false', async () => {
      delete process.env.ENABLE_GOOGLE_ADS_DISPATCH;

      const result = await dispatchGoogleAdsCampaign(102);

      expect(result.dispatched).toBe(false);
      expect(result.reason).toContain('GOOGLE_ADS_CONTAINMENT_LOCKED');
    });
  });
});
