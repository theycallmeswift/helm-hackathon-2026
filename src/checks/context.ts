/**
 * What every check reads besides the snapshot: the clock and the tunable
 * thresholds. Passing `now` in keeps the checks pure and lets tests control
 * time.
 */

import type { CheckResult, PrSnapshot } from '../pr/types.ts';

/** The numbers the size and staleness checks judge against. */
export interface CheckThresholds {
  /** Changed lines at which a pull request counts as medium. */
  mediumSizeLines: number;
  /** Changed lines at which a pull request counts as large, and the size check warns. */
  largeSizeLines: number;
  /** Days without human activity at which the staleness check warns. */
  staleWarnDays: number;
  /** Days without human activity at which the staleness check fails. */
  staleFailDays: number;
}

/** The thresholds used when a caller overrides none. */
export const DEFAULT_THRESHOLDS: CheckThresholds = {
  mediumSizeLines: 100,
  largeSizeLines: 500,
  staleWarnDays: 30,
  staleFailDays: 90,
};

/** What a caller passes to `runChecks`. */
export interface CheckOptions {
  /** The instant staleness is measured to. */
  now: Date;
  /** Overrides for any of `DEFAULT_THRESHOLDS`. */
  thresholds?: Partial<CheckThresholds>;
}

/** What each check receives besides the snapshot, with every threshold resolved. */
export interface CheckContext {
  now: Date;
  thresholds: CheckThresholds;
}

/** One deterministic check: a pure function from a snapshot to its verdict. */
export type Check = (snapshot: PrSnapshot, context: CheckContext) => CheckResult;

/** The first seven characters of a commit SHA, as GitHub shows them. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** The calendar date of `instant` in UTC, as `YYYY-MM-DD`. */
export function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
