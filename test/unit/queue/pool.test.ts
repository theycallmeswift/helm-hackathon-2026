import { expect, test } from 'vitest';

import { mapWithConcurrency } from '../../../src/queue/pool.ts';

test.each([
  { itemCount: 12, limit: 5, expectedPeak: 5 },
  { itemCount: 3, limit: 5, expectedPeak: 3 },
  { itemCount: 4, limit: 1, expectedPeak: 1 },
])(
  '$itemCount jobs with a cap of $limit never run more than $expectedPeak at once',
  async ({ itemCount, limit, expectedPeak }) => {
    const items = Array.from({ length: itemCount }, (_, index) => index);
    let running = 0;
    let peak = 0;

    const results = await mapWithConcurrency(items, limit, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      await Promise.resolve();
      running -= 1;
      return item * 10;
    });

    expect(peak).toBe(expectedPeak);
    expect(results).toEqual(items.map((item) => item * 10));
  },
);
