/**
 * Fills the AI flags for `queue --ai`, cache first: a cached head commit
 * costs no request, a miss with an API key asks OpenRouter and fills the
 * cache, and a miss without a key is left empty. One failure never aborts
 * the queue.
 */

import { readCachedAiFlags } from '../ai/cache.ts';
import { getAiFlags } from '../ai/flags.ts';
import type { Config } from '../config/load.ts';
import type { AiOutcome, PrSnapshot } from '../pr/types.ts';
import { type QueueSection, SNAPSHOT_CONCURRENCY } from './build.ts';
import { mapWithConcurrency } from './pool.ts';

/** How many pull requests ended up without AI flags, and why. */
export interface AiFillSummary {
  /** Not cached, and no API key to ask with. */
  uncachedWithoutKey: number;
  /** Asked, but the request gave no usable answer. */
  failed: number;
}

/**
 * Sets `ai` on every entry in `sections`, with at most `SNAPSHOT_CONCURRENCY`
 * lookups at once, and counts the entries left without flags.
 */
export async function fillAiFlags(
  sections: QueueSection[],
  config: Config,
): Promise<AiFillSummary> {
  const entries = sections.flatMap((section) => section.entries);
  await mapWithConcurrency(entries, SNAPSHOT_CONCURRENCY, async (entry) => {
    entry.ai = await lookUpAiFlags(entry.snapshot, config);
  });

  return {
    uncachedWithoutKey: entries.filter((entry) => entry.ai?.status === 'skipped').length,
    failed: entries.filter((entry) => entry.ai?.status === 'failed').length,
  };
}

/** The cached flags for the head commit, else a fresh request when a key is set. */
async function lookUpAiFlags(snapshot: PrSnapshot, config: Config): Promise<AiOutcome> {
  try {
    const cached = await readCachedAiFlags(
      config.cacheDir,
      snapshot.repo,
      snapshot.number,
      snapshot.headSha,
    );

    return cached ?? (await getAiFlags(snapshot, config));
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** The lines printed after the queue about missing AI flags; none when every row has them. */
export function aiFooterLines(summary: AiFillSummary): string[] {
  const lines: string[] = [];
  if (summary.uncachedWithoutKey > 0) {
    lines.push(
      `${pullRequests(summary.uncachedWithoutKey)} had no cached AI data and OPENROUTER_API_KEY is not set`,
    );
  }
  if (summary.failed > 0) {
    lines.push(`AI flags failed for ${pullRequests(summary.failed)}`);
  }

  return lines;
}

/** `count` pull requests, in words. */
function pullRequests(count: number): string {
  return count === 1 ? '1 pull request' : `${count} pull requests`;
}
