/**
 * Phase 3.8: Google Ads Budget & Micros Conversion Test Suite
 *
 * Certified Scenarios:
 * 1. $1.00 (100 minor units) -> 1,000,000 micros
 * 2. $85.00 (8,500 minor units) -> 85,000,000 micros
 * 3. $100.00 (10,000 minor units) -> 100,000,000 micros
 * 4. ₹1.00 (100 paise) -> 1,000,000 micros
 * 5. ₹2500.00 (250,000 paise) -> 2,500,000,000 micros
 * 6. Zero budget (0 minor units -> 0 micros)
 * 7. Negative minor units throws GOOGLE_INVALID_ARGUMENT
 * 8. Fractional minor units throws GOOGLE_INVALID_ARGUMENT
 * 9. Non-ISO currency throws GOOGLE_INVALID_ARGUMENT
 * 10. Large values & overflow protection
 * 11. Reverse conversion (fromGoogleMicros)
 */

import { describe, it, expect } from 'vitest';
import { GoogleTelemetryMapper } from '../lib/providers/google/googleTelemetryMapper.js';

describe('PHASE 3.8: GOOGLE ADS BUDGET & MICROS CONVERSION TEST SUITE', () => {
  it('1. Converts $1.00 (100 minor units) to 1,000,000 micros', () => {
    const micros = GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: 100 });
    expect(micros).toBe(1_000_000);
  });

  it('2. Converts $85.00 (8,500 minor units) to 85,000,000 micros', () => {
    const micros = GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: 8500 });
    expect(micros).toBe(85_000_000);
  });

  it('3. Converts $100.00 (10,000 minor units) to 100,000,000 micros', () => {
    const micros = GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: 10000 });
    expect(micros).toBe(100_000_000);
  });

  it('4. Converts ₹1.00 (100 paise) to 1,000,000 micros', () => {
    const micros = GoogleTelemetryMapper.toGoogleMicros({ currency: 'INR', minor_units: 100 });
    expect(micros).toBe(1_000_000);
  });

  it('5. Converts ₹2,500.00 (250,000 paise) to 2,500,000,000 micros', () => {
    const micros = GoogleTelemetryMapper.toGoogleMicros({ currency: 'INR', minor_units: 250000 });
    expect(micros).toBe(2_500_000_000);
  });

  it('6. Converts Zero budget (0 minor units) to 0 micros', () => {
    const micros = GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: 0 });
    expect(micros).toBe(0);
  });

  it('7. Negative minor units throws deterministic error', () => {
    expect(() => {
      GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: -500 });
    }).toThrow(/Negative budget amount prohibited/);
  });

  it('8. Fractional minor units throws deterministic error', () => {
    expect(() => {
      GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: 100.55 as any });
    }).toThrow(/Fractional minor_units prohibited/);
  });

  it('9. Invalid ISO currency throws deterministic error', () => {
    expect(() => {
      GoogleTelemetryMapper.toGoogleMicros({ currency: 'INVALID_CURRENCY', minor_units: 100 });
    }).toThrow(/Invalid ISO currency code/);
  });

  it('10. Enforces overflow ceiling on extremely large values', () => {
    expect(() => {
      GoogleTelemetryMapper.toGoogleMicros({ currency: 'USD', minor_units: 999_999_999_999 });
    }).toThrow(/Budget exceeds maximum supported ceiling/);
  });

  it('11. Converts from Google Micros back to MoneyAmount', () => {
    const money = GoogleTelemetryMapper.fromGoogleMicros(85_000_000, 'USD');
    expect(money.currency).toBe('USD');
    expect(money.minor_units).toBe(8500);
  });
});
