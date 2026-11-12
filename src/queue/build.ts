/**
 * Builds the queue: lists open pull requests, fetches a snapshot of each,
 * runs the checks, and groups the results by bucket, oldest waiting first.
 * Related pull requests are matched from the listing, so a queue of any size
 * makes no issue searches.
 */

import { runChecks } from '../checks/run.ts';
import type { Config } from '../config/load.ts';
import type { Fetch } from '../github/client.ts';
import { listOpenPrs } from '../github/open-prs.ts';
import { fetchPrSnapshot } from '../github/snapshot.ts';
import type { AiOutcome, CheckResult, PrSnapshot, RepoName } from '../pr/types.ts';
import { assignBucket, BUCKET_IDS, type BucketId } from './buckets.ts';
import { mapWithConcurrency } from './pool.ts';

/** Most snapshots fetched at once, since each costs several REST requests. */
export const SNAPSHOT_CONCURRENCY = 5;

/** One pull request in the queue. */
export interface QueueEntry {
  snapshot: PrSnapshot;
  checks: CheckResult[];
  bucket: BucketId;
  /** Why it is in `bucket`, one short line each; see `BucketAssignment`. */
  reasons: string[];
  /** The later of the pull request's creation and its head commit date. */
  waitingSince: Date;
  /** The AI flags, set only with `--ai`; never read by bucketing. */
  ai?: AiOutcome;
}

/** One bucket and its pull requests, oldest waiting first. */
export interface QueueSection {
  bucket: BucketId;
  entries: QueueEntry[];
}

/** What to build the queue for. */
export interface BuildQueueOptions {
  repo: RepoName;
  /** Only the `limit` oldest opened pull requests; all when absent. */
  limit?: number;
  /** The instant staleness and ages are measured to. */
  now: Date;
  /** Network and clock edges, replaced in tests. */
  fetch?: Fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Every bucket in precedence order, each with its pull requests oldest
 * waiting first. Empty buckets are included so counts read as zero.
 *
 * @throws {MissingSecretError} when `GITHUB_TOKEN` is unset.
 * @throws {GithubApiError} when a request fails.
 */
export async function buildQueue(
  config: Config,
  options: BuildQueueOptions,
): Promise<QueueSection[]> {
  const fetchOptions = {
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
  };
  const openPrs = await listOpenPrs(config, options.repo, fetchOptions);
  const selected = options.limit === undefined ? openPrs : openPrs.slice(0, options.limit);

  const snapshots = await mapWithConcurrency(selected, SNAPSHOT_CONCURRENCY, (openPr) =>
    fetchPrSnapshot(config, options.repo, openPr.number, { ...fetchOptions, openPrs }),
  );

  return groupIntoSections(snapshots.map((snapshot) => toEntry(snapshot, options.now)));
}

/** Runs the checks on `snapshot` and assigns its bucket. */
export function toEntry(snapshot: PrSnapshot, now: Date): QueueEntry {
  const checks = runChecks(snapshot, { now });

  return {
    snapshot,
    checks,
    ...assignBucket(snapshot, checks),
    waitingSince: waitingSince(snapshot),
  };
}

/** Groups `entries` by bucket in precedence order, oldest waiting first within each. */
export function groupIntoSections(entries: QueueEntry[]): QueueSection[] {
  return BUCKET_IDS.map((bucket) => ({
    bucket,
    entries: entries
      .filter((entry) => entry.bucket === bucket)
      .sort(
        (left, right) =>
          left.waitingSince.getTime() - right.waitingSince.getTime() ||
          left.snapshot.number - right.snapshot.number,
      ),
  }));
}

/** The later of creation and the head commit's date: when the pull request last changed hands. */
function waitingSince(snapshot: PrSnapshot): Date {
  const headCommittedAt = snapshot.commits.at(-1)?.committedAt;
  if (headCommittedAt === undefined || headCommittedAt < snapshot.createdAt) {
    return snapshot.createdAt;
  }

  return headCommittedAt;
}
