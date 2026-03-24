/**
 * Dashboard statistics for ShopGraph quality metrics.
 *
 * For the MVP, stats are embedded from the initial 95-URL test run.
 * Future: daily cron updates stats via Vercel KV or Blob storage.
 */

export interface VerticalStats {
  name: string;
  tested: number;
  success_rate: number;
  avg_confidence: number;
}

export interface DashboardStats {
  total_tested: number;
  total_successful: number;
  overall_success_rate: number;
  overall_confidence: number;
  last_updated: string;
  verticals: VerticalStats[];
}

/**
 * Baseline stats from the 95-URL test run on 2026-03-24.
 * Only includes verticals with actual test data.
 * Pets, Automotive, Office URLs are in the corpus but not yet tested.
 */
const BASELINE_STATS: DashboardStats = {
  total_tested: 95,
  total_successful: 79,
  overall_success_rate: 89,
  overall_confidence: 0.81,
  last_updated: "2026-03-24",
  verticals: [
    { name: "Fashion & Apparel", tested: 21, success_rate: 90, avg_confidence: 0.86 },
    { name: "Electronics & Tech", tested: 18, success_rate: 94, avg_confidence: 0.73 },
    { name: "Home & Furniture", tested: 13, success_rate: 77, avg_confidence: 0.79 },
    { name: "Health & Beauty", tested: 13, success_rate: 85, avg_confidence: 0.84 },
    { name: "Sports & Outdoors", tested: 7, success_rate: 100, avg_confidence: 0.84 },
    { name: "Jewelry & Accessories", tested: 2, success_rate: 100, avg_confidence: 0.95 },
    { name: "Food & Beverage", tested: 2, success_rate: 100, avg_confidence: 0.82 },
  ],
};

/** Returns current dashboard stats. MVP: returns baseline. Future: reads from KV/Blob. */
export function getDashboardStats(): DashboardStats {
  return BASELINE_STATS;
}
