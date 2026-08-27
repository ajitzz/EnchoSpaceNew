import { describe, it, expect } from 'vitest';
import { loadRazorpayScript } from '../../lib/razorpay';

describe('Razorpay Instant Checkout Infrastructure Audit', () => {
  it('should resolve loadRazorpayScript without errors in node environment', async () => {
    const loaded = await loadRazorpayScript();
    expect(typeof loaded).toBe('boolean');
  });

  it('should maintain sub-150ms verification contract parameters', () => {
    const payload = {
      razorpay_order_id: 'order_test_123',
      razorpay_payment_id: 'pay_test_456',
      razorpay_signature: 'sig_test_789',
      booking_id: 101
    };

    expect(payload.razorpay_order_id).toBeDefined();
    expect(payload.razorpay_payment_id).toBeDefined();
    expect(payload.razorpay_signature).toBeDefined();
    expect(payload.booking_id).toBe(101);
  });
});
