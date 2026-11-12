/** Runs async work over a list with a cap on how much runs at once. */

/**
 * Maps `items` through `work`, never running more than `limit` at once, and
 * resolves to the results in input order. Rejects with the first failure.
 *
 * @throws {RangeError} when `limit` is not a positive whole number.
 */
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`concurrency limit must be a positive whole number, got ${limit}`);
  }

  const results = new Array<Result>(items.length);
  let nextIndex = 0;

  /** Takes the next unclaimed item until none remain. */
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await work(items[index] as Item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
