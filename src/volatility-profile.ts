/**
 * Per-merchant volatility profile lookup (LAU-330 ckpt 2/3).
 *
 * Maps known promo-heavy domains to faster-decay volatility classes so the
 * freshness model expires their availability + price signals on the cadence
 * those sites actually update at, not on the generic 30-min real_time half-life.
 *
 * Initial seed (2026-06-01): five domains chosen for active discount cadence
 * and frequent inventory/price churn. Expand the seed as we observe more
 * domains in calibration.
 *
 * Used by buildFieldFreshness / decayConfidence callers that have access to
 * the merchant domain. See types.ts for the underlying decay formula.
 */
import { type VolatilityClass, FIELD_VOLATILITY } from './types.js';

/**
 * Known promo-heavy merchant domains routed to hyper_volatile for their
 * most-volatile fields (price + availability). Keys are normalised to
 * lowercase eTLD+1-style host strings (no protocol, no path).
 *
 * Rationale per domain:
 *   - etsy.com       — frequent stock-out on handmade/single-quantity items
 *   - ebay.com       — auction + buy-now mix; quantity changes mid-session
 *   - aliexpress.com — flash sales, daily-deal banners, inventory drains fast
 *   - temu.com       — aggressive countdown/limited-stock UX; high churn
 *   - sheinn.com (typo guard) → shein.com — fast-fashion flash drops
 */
const PROMO_HEAVY_DOMAINS: ReadonlySet<string> = new Set([
  'etsy.com',
  'ebay.com',
  'aliexpress.com',
  'temu.com',
  'shein.com',
]);

/**
 * Fields whose volatility we override for promo-heavy merchants. Other fields
 * (product_name, brand, etc.) keep their default classes from FIELD_VOLATILITY.
 */
const PROMO_HEAVY_OVERRIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'price',
  'availability',
]);

/**
 * Normalise a host string for lookup. Accepts:
 *   - bare host: "etsy.com"
 *   - host with www: "www.etsy.com"
 *   - host with subdomain: "shop.etsy.com"
 *   - full URL: "https://www.etsy.com/listing/123"
 *
 * Returns the eTLD+1 portion in lowercase, or null if unparseable.
 */
export function normaliseDomain(input: string): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  // Strip path/query if a hostname slipped through with one.
  host = host.replace(/[/?#].*$/, '');
  if (!host) return null;
  // Strip leading www.
  host = host.replace(/^www\./, '');
  // Crude eTLD+1: last two labels. Sufficient for the seed list which uses
  // single-segment TLDs (.com only). If the seed ever includes country-code
  // TLDs (.co.uk etc.) we'll need PSL-aware parsing.
  const parts = host.split('.');
  if (parts.length >= 2) {
    host = parts.slice(-2).join('.');
  }
  return host || null;
}

/**
 * Look up the volatility class for a (domain, field) pair.
 *
 * Returns hyper_volatile when both:
 *   1. The merchant is on the promo-heavy seed list
 *   2. The field is one we override for promo-heavy merchants (price/availability)
 *
 * Otherwise returns the default class from FIELD_VOLATILITY (which itself
 * falls back to 'slow_change' for unknown fields).
 */
export function getVolatilityClass(
  domain: string,
  field: string,
): VolatilityClass {
  const defaultClass: VolatilityClass = FIELD_VOLATILITY[field] ?? 'slow_change';
  const host = normaliseDomain(domain);
  if (!host) return defaultClass;
  if (!PROMO_HEAVY_DOMAINS.has(host)) return defaultClass;
  if (!PROMO_HEAVY_OVERRIDDEN_FIELDS.has(field)) return defaultClass;
  return 'hyper_volatile';
}

/**
 * Exposed for tests / introspection. Do not mutate.
 */
export const PROMO_HEAVY_DOMAINS_VIEW: ReadonlySet<string> = PROMO_HEAVY_DOMAINS;
