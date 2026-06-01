import { describe, it, expect } from 'vitest';
import {
  detectAvailabilityPattern,
  parseAvailabilitySignals,
  AVAILABILITY_CONFIDENCE,
} from '../availability-parser.js';
import type { PriceHints } from '../html-cleaner.js';

const emptyHints: PriceHints = {
  prices: [],
  currency: null,
  availabilitySignals: [],
  metaPriceAmount: null,
  metaAvailability: null,
};

describe('detectAvailabilityPattern — single-pattern recognition (LAU-330)', () => {
  // ── Pattern 1: in_stock ────────────────────────────────────────
  it('matches "In Stock" → in_stock_signal', () => {
    expect(detectAvailabilityPattern('Product info — In Stock').pattern).toBe('in_stock_signal');
    expect(detectAvailabilityPattern('Available now').pattern).toBe('in_stock_signal');
    expect(detectAvailabilityPattern('Click Add to Cart for fast shipping').pattern).toBe(
      'in_stock_signal',
    );
    expect(detectAvailabilityPattern('Buy now and save').pattern).toBe('in_stock_signal');
    expect(detectAvailabilityPattern('Ready to ship in 1 hour').pattern).toBe('in_stock_signal');
  });

  // ── Pattern 2: out_of_stock ────────────────────────────────────
  it('matches "Out of Stock" → out_of_stock_signal', () => {
    expect(detectAvailabilityPattern('OUT OF STOCK — notify me when available').pattern).toBe(
      'out_of_stock_signal',
    );
    expect(detectAvailabilityPattern('Sold Out').pattern).toBe('out_of_stock_signal');
    expect(detectAvailabilityPattern('Currently unavailable').pattern).toBe('out_of_stock_signal');
    expect(detectAvailabilityPattern('Email when available').pattern).toBe('out_of_stock_signal');
  });

  // ── Pattern 3: low_stock ───────────────────────────────────────
  it('matches "Only 3 left" → low_stock_signal with quantity', () => {
    const r = detectAvailabilityPattern('Hurry! Only 3 left in stock');
    expect(r.pattern).toBe('low_stock_signal');
    expect(r.quantity_remaining).toBe(3);
  });

  it('matches "12 remaining" → low_stock_signal with quantity', () => {
    const r = detectAvailabilityPattern('12 remaining at this price');
    expect(r.pattern).toBe('low_stock_signal');
    expect(r.quantity_remaining).toBe(12);
  });

  it('matches generic "Low stock" without quantity', () => {
    const r = detectAvailabilityPattern('Low stock — order soon');
    expect(r.pattern).toBe('low_stock_signal');
    expect(r.quantity_remaining).toBeUndefined();
  });

  it('does NOT treat "100 left" as low_stock', () => {
    // 100 is over the 20-unit scarcity ceiling, so the qty-extract branch
    // rejects it. With no fallback in_stock keywords, returns no_signal.
    const r = detectAvailabilityPattern('100 left in this batch');
    expect(r.pattern).toBe('no_signal');
  });

  it('treats explicit "In stock" alongside large quantity as in_stock', () => {
    const r = detectAvailabilityPattern('In stock — 100 available now');
    expect(r.pattern).toBe('in_stock_signal');
  });

  // ── Pattern 4: backordered ────────────────────────────────────
  it('matches "Backordered" → backordered_signal', () => {
    expect(detectAvailabilityPattern('Item is backordered').pattern).toBe('backordered_signal');
    expect(detectAvailabilityPattern('Pre-order today, ships in 4 weeks').pattern).toBe(
      'backordered_signal',
    );
    expect(detectAvailabilityPattern('Ships in 2 weeks').pattern).toBe('backordered_signal');
    expect(detectAvailabilityPattern('On backorder').pattern).toBe('backordered_signal');
  });

  // ── Pattern 5: quote_only ──────────────────────────────────────
  it('matches "Contact for Pricing" → quote_only_signal', () => {
    expect(detectAvailabilityPattern('Contact us for pricing').pattern).toBe('quote_only_signal');
    expect(detectAvailabilityPattern('Quote on request').pattern).toBe('quote_only_signal');
    expect(detectAvailabilityPattern('Call for price').pattern).toBe('quote_only_signal');
    expect(detectAvailabilityPattern('Request a quote').pattern).toBe('quote_only_signal');
    expect(detectAvailabilityPattern('Price on request').pattern).toBe('quote_only_signal');
  });

  // ── Pattern 6: no_signal ──────────────────────────────────────
  it('returns no_signal when no patterns match', () => {
    expect(detectAvailabilityPattern('').pattern).toBe('no_signal');
    expect(detectAvailabilityPattern('this is just a description with no stock info').pattern).toBe(
      'no_signal',
    );
  });

  // ── Precedence ─────────────────────────────────────────────────
  it('prefers out_of_stock over in_stock when both appear', () => {
    // E.g. a page with "in stock" in the nav and "out of stock" in the buy-box.
    expect(detectAvailabilityPattern('In stock category. Buy box: Out of Stock').pattern).toBe(
      'out_of_stock_signal',
    );
  });

  it('prefers quote_only over in_stock for B2B pages', () => {
    expect(
      detectAvailabilityPattern('Available for sale. Contact us for pricing.').pattern,
    ).toBe('quote_only_signal');
  });
});

describe('parseAvailabilitySignals — confidence emission per pattern', () => {
  it('emits 0.85 for in_stock_signal', () => {
    const result = parseAvailabilitySignals('in_stock', emptyHints, 'In Stock and ready');
    expect(result.value).toBe('in_stock');
    expect(result.confidence).toBeCloseTo(0.85, 3);
    expect(result.matched_pattern).toBe('in_stock_signal');
  });

  it('emits 0.85 for out_of_stock_signal', () => {
    const result = parseAvailabilitySignals('in_stock', emptyHints, 'Sold Out — notify me');
    expect(result.value).toBe('out_of_stock');
    expect(result.confidence).toBeCloseTo(0.85, 3);
    expect(result.matched_pattern).toBe('out_of_stock_signal');
  });

  it('emits 0.80 for low_stock_signal and propagates quantity', () => {
    const result = parseAvailabilitySignals('in_stock', emptyHints, 'Only 2 left in stock');
    expect(result.value).toBe('low_stock');
    expect(result.confidence).toBeCloseTo(0.80, 3);
    expect(result.matched_pattern).toBe('low_stock_signal');
    expect(result.quantity_remaining).toBe(2);
  });

  it('emits 0.75 for backordered_signal', () => {
    const result = parseAvailabilitySignals('unknown', emptyHints, 'Ships in 6 weeks');
    expect(result.value).toBe('backordered');
    expect(result.confidence).toBeCloseTo(0.75, 3);
    expect(result.matched_pattern).toBe('backordered_signal');
  });

  it('emits 0.70 for quote_only_signal', () => {
    const result = parseAvailabilitySignals('unknown', emptyHints, 'Contact for Pricing');
    expect(result.value).toBe('quote_only');
    expect(result.confidence).toBeCloseTo(0.70, 3);
    expect(result.matched_pattern).toBe('quote_only_signal');
  });

  // ── KEY calibration fix: unknown @ 0.30 ──────────────────────
  it('emits unknown @ 0.30 when no signal + LLM also said unknown (LAU-330 key fix)', () => {
    const result = parseAvailabilitySignals('unknown', emptyHints, 'lorem ipsum');
    expect(result.value).toBe('unknown');
    expect(result.confidence).toBeCloseTo(0.30, 3);
    expect(result.matched_pattern).toBe('no_signal');
  });

  it('preserves LLM in_stock with reduced confidence when no signal corroborates', () => {
    const result = parseAvailabilitySignals('in_stock', emptyHints, 'no relevant text here');
    expect(result.value).toBe('in_stock');
    // 0.85 - 0.05 = 0.80
    expect(result.confidence).toBeCloseTo(0.80, 3);
    expect(result.matched_pattern).toBe('no_signal');
  });

  it('preserves LLM preorder via backordered_signal pattern', () => {
    const result = parseAvailabilitySignals('preorder', emptyHints, 'Pre-order today, ships soon');
    expect(result.value).toBe('preorder');
    expect(result.confidence).toBeCloseTo(0.80, 3);
    expect(result.matched_pattern).toBe('backordered_signal');
  });

  it('uses priceHints.metaAvailability as part of haystack', () => {
    const hints: PriceHints = { ...emptyHints, metaAvailability: 'OutOfStock' };
    const result = parseAvailabilitySignals('unknown', hints, '');
    expect(result.value).toBe('out_of_stock');
  });

  it('uses priceHints.availabilitySignals as part of haystack', () => {
    const hints: PriceHints = {
      ...emptyHints,
      availabilitySignals: ['add to cart'],
    };
    const result = parseAvailabilitySignals('unknown', hints, '');
    expect(result.value).toBe('in_stock');
  });
});

describe('AVAILABILITY_CONFIDENCE baselines', () => {
  it('matches the ticket-specified per-pattern baselines exactly', () => {
    expect(AVAILABILITY_CONFIDENCE.in_stock).toBe(0.85);
    expect(AVAILABILITY_CONFIDENCE.out_of_stock).toBe(0.85);
    expect(AVAILABILITY_CONFIDENCE.low_stock).toBe(0.80);
    expect(AVAILABILITY_CONFIDENCE.backordered).toBe(0.75);
    expect(AVAILABILITY_CONFIDENCE.quote_only).toBe(0.70);
    // The KEY calibration fix.
    expect(AVAILABILITY_CONFIDENCE.unknown).toBe(0.30);
    // Preorder retained for schema.org back-compat.
    expect(AVAILABILITY_CONFIDENCE.preorder).toBe(0.80);
  });
});
