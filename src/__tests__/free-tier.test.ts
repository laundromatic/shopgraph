import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FreeTierTracker } from '../free-tier.js';

describe('FreeTierTracker', () => {
  let tracker: FreeTierTracker;

  beforeEach(() => {
    tracker = new FreeTierTracker();
  });

  it('starts with 0 usage for unknown clients', () => {
    expect(tracker.getUsage('client-1')).toBe(0);
  });

  it('increments usage for a client', () => {
    tracker.increment('client-1');
    expect(tracker.getUsage('client-1')).toBe(1);

    tracker.increment('client-1');
    expect(tracker.getUsage('client-1')).toBe(2);
  });

  it('tracks clients independently', () => {
    tracker.increment('client-1');
    tracker.increment('client-1');
    tracker.increment('client-2');

    expect(tracker.getUsage('client-1')).toBe(2);
    expect(tracker.getUsage('client-2')).toBe(1);
  });

  it('reports hasRemaining correctly', () => {
    expect(tracker.hasRemaining('client-1')).toBe(true);

    // Simulate exhausting the free tier
    for (let i = 0; i < 200; i++) {
      tracker.increment('client-1');
    }
    expect(tracker.hasRemaining('client-1')).toBe(false);
  });

  it('returns correct summary', () => {
    tracker.increment('client-1');
    tracker.increment('client-1');
    tracker.increment('client-1');

    const summary = tracker.getSummary('client-1');
    expect(summary).toEqual({
      used: 3,
      limit: 200,
      remaining: 197,
    });
  });

  it('resets usage when month changes', () => {
    tracker.increment('client-1');
    expect(tracker.getUsage('client-1')).toBe(1);

    // Mock a month change by directly manipulating the internal state
    // This tests the month boundary logic
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    // Access internal map to simulate month change
    const internalMap = (tracker as unknown as { usage: Map<string, { count: number; month: string }> }).usage;
    internalMap.set('client-1', { count: 50, month: monthStr });

    // Current month should show 0 (the stored month doesn't match)
    // Unless we're actually in that next month
    const currentMonth = new Date();
    const currentMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

    if (monthStr !== currentMonthStr) {
      expect(tracker.getUsage('client-1')).toBe(0);
    }
  });

  it('returns 0 remaining when over limit', () => {
    for (let i = 0; i < 250; i++) {
      tracker.increment('client-1');
    }
    const summary = tracker.getSummary('client-1');
    expect(summary.remaining).toBe(0);
    expect(summary.used).toBe(250);
  });
});
