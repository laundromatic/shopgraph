import { describe, it, expect } from 'vitest';
import {
  VOLATILITY_HALF_LIFE,
  decayConfidence,
  FIELD_VOLATILITY,
  type VolatilityClass,
} from '../types.js';

describe('hyper_volatile volatility class (LAU-330)', () => {
  it('has a 10-minute (600s) half-life', () => {
    expect(VOLATILITY_HALF_LIFE.hyper_volatile).toBe(600);
  });

  it('decays faster than real_time', () => {
    expect(VOLATILITY_HALF_LIFE.hyper_volatile).toBeLessThan(VOLATILITY_HALF_LIFE.real_time);
  });

  it('is a valid VolatilityClass member', () => {
    const c: VolatilityClass = 'hyper_volatile';
    expect(c).toBe('hyper_volatile');
  });

  it('applies decay formula correctly for hyper_volatile fields', () => {
    // Temporarily map availability to hyper_volatile to test decay through
    // the existing decayConfidence helper. (FIELD_VOLATILITY is a mutable
    // Record; restore after the test.)
    const originalClass = FIELD_VOLATILITY.availability;
    FIELD_VOLATILITY.availability = 'hyper_volatile';
    try {
      const start = 0.85;

      // At half-life (600s), confidence should be halved.
      const halved = decayConfidence(start, 'availability', 600);
      expect(halved).toBeCloseTo(0.425, 3);

      // At 2x half-life, confidence should be quartered.
      const quartered = decayConfidence(start, 'availability', 1200);
      expect(quartered).toBeCloseTo(0.2125, 3);

      // After 30 minutes (1800s = 3 half-lives for hyper_volatile),
      // confidence should be at 12.5% of original.
      const after30min = decayConfidence(start, 'availability', 1800);
      expect(after30min).toBeCloseTo(start * Math.pow(0.5, 3), 3);

      // Sanity: same age under real_time (30-min half-life) would still
      // be at 50% of original.
      FIELD_VOLATILITY.availability = 'real_time';
      const realTime30min = decayConfidence(start, 'availability', 1800);
      expect(realTime30min).toBeCloseTo(start * 0.5, 3);
      expect(after30min).toBeLessThan(realTime30min);
    } finally {
      FIELD_VOLATILITY.availability = originalClass;
    }
  });

  it('preserves existing volatility-class half-lives', () => {
    expect(VOLATILITY_HALF_LIFE.real_time).toBe(30 * 60);
    expect(VOLATILITY_HALF_LIFE.volatile).toBe(2 * 60 * 60);
    expect(VOLATILITY_HALF_LIFE.slow_change).toBe(24 * 60 * 60);
    expect(VOLATILITY_HALF_LIFE.stable).toBe(7 * 24 * 60 * 60);
  });
});
