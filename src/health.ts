/**
 * Health check and alerting for the ShopGraph test pipeline.
 * Monitors success rate and triggers alerts when degraded.
 */

import type { Redis } from '@upstash/redis';
import { KV_KEYS, getRedis } from './stats.js';
import { getQuarantineCount, getQuarantinedUrls } from './circuit-breaker.js';
import type { QuarantineEntry } from './circuit-breaker.js';

const ALERT_THRESHOLD = 70; // percent
const DEGRADED_THRESHOLD = 50; // percent

export type HealthStatus = 'healthy' | 'degraded' | 'critical';

export interface HealthAlert {
  type: string;
  message: string;
  since: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  success_rate: number;
  threshold: number;
  quarantined_urls: number;
  last_cron_run: string | null;
  alerts: HealthAlert[];
}

// KV keys for health/alerting
export const HEALTH_KEYS = {
  ALERT_LOW_SUCCESS: 'alert:low_success_rate',
  LAST_CRON_RUN: 'health:last_cron_run',
  LAST_VERIFY_RUN: 'health:last_verify_run',
} as const;

export interface AlertPayload {
  rate: number;
  timestamp: string;
  batch_offset: number;
  message: string;
}

/**
 * Store an alert in KV when success rate drops below threshold.
 */
export async function storeAlert(
  redis: Redis,
  overallSuccessRate: number,
  batchOffset: number,
): Promise<void> {
  if (overallSuccessRate < ALERT_THRESHOLD) {
    const payload: AlertPayload = {
      rate: overallSuccessRate,
      timestamp: new Date().toISOString(),
      batch_offset: batchOffset,
      message: `Success rate ${overallSuccessRate}% is below ${ALERT_THRESHOLD}% threshold`,
    };
    await redis.set(HEALTH_KEYS.ALERT_LOW_SUCCESS, payload);
  } else {
    // Clear alert if rate recovered
    await redis.del(HEALTH_KEYS.ALERT_LOW_SUCCESS);
  }
}

/**
 * Record when the cron last ran.
 */
export async function recordCronRun(redis: Redis): Promise<void> {
  await redis.set(HEALTH_KEYS.LAST_CRON_RUN, new Date().toISOString());
}

/**
 * Record when verification last ran.
 */
export async function recordVerifyRun(redis: Redis): Promise<void> {
  await redis.set(HEALTH_KEYS.LAST_VERIFY_RUN, new Date().toISOString());
}

/**
 * Fire a webhook alert for low success rate.
 * Does not throw — alert delivery is best-effort.
 */
export async function fireWebhookAlert(
  overallSuccessRate: number,
): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'shopgraph',
        alert: 'low_success_rate',
        rate: overallSuccessRate,
        threshold: ALERT_THRESHOLD,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Don't fail the cron if webhook fails
    console.error('[health] Failed to fire webhook alert');
  }
}

/**
 * Determine health status from success rate.
 */
export function getHealthStatus(successRate: number): HealthStatus {
  if (successRate >= ALERT_THRESHOLD) return 'healthy';
  if (successRate >= DEGRADED_THRESHOLD) return 'degraded';
  return 'critical';
}

/**
 * Run a full health check — reads from KV and returns status.
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const redis = getRedis();

  // Default response when KV is not configured
  if (!redis) {
    return {
      status: 'healthy',
      success_rate: 0,
      threshold: ALERT_THRESHOLD,
      quarantined_urls: 0,
      last_cron_run: null,
      alerts: [],
    };
  }

  try {
    // Fetch data in parallel
    const [overall, alert, lastCronRun, quarantineCount] = await Promise.all([
      redis.get<{ overall_success_rate: number }>(KV_KEYS.OVERALL),
      redis.get<AlertPayload>(HEALTH_KEYS.ALERT_LOW_SUCCESS),
      redis.get<string>(HEALTH_KEYS.LAST_CRON_RUN),
      getQuarantineCount(redis),
    ]);

    const successRate = overall?.overall_success_rate ?? 0;
    const status = getHealthStatus(successRate);

    const alerts: HealthAlert[] = [];
    if (alert) {
      alerts.push({
        type: 'low_success_rate',
        message: alert.message,
        since: alert.timestamp,
      });
    }

    return {
      status,
      success_rate: successRate,
      threshold: ALERT_THRESHOLD,
      quarantined_urls: quarantineCount,
      last_cron_run: lastCronRun,
      alerts,
    };
  } catch (err) {
    console.error('[health] Health check failed:', err);
    return {
      status: 'critical',
      success_rate: 0,
      threshold: ALERT_THRESHOLD,
      quarantined_urls: 0,
      last_cron_run: null,
      alerts: [{
        type: 'health_check_error',
        message: 'Failed to read health data from KV',
        since: new Date().toISOString(),
      }],
    };
  }
}

/**
 * Check per-field extraction rates and alert if any critical field drops below 60%.
 */
export async function checkFieldHealth(redis: Redis, fieldStats: import('./stats.js').FieldStats[]): Promise<void> {
  const criticalFields = ['product_name', 'price', 'brand'];
  for (const stat of fieldStats) {
    if (criticalFields.includes(stat.field_name) && stat.extraction_rate < 0.60) {
      await redis.set('alert:field_degraded', JSON.stringify({
        field: stat.field_name,
        extraction_rate: stat.extraction_rate,
        threshold: 0.60,
        timestamp: new Date().toISOString(),
      }));
    }
  }
}

export { ALERT_THRESHOLD, DEGRADED_THRESHOLD };
