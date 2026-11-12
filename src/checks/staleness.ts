/** The staleness check: how long since a human last touched the pull request. */

import type { CheckResult, CheckStatus, PrSnapshot } from '../pr/types.ts';
import { type CheckContext, isoDate } from './context.ts';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, rounded down. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY);
}

/**
 * Measures days since the latest non-bot activity, or since creation when
 * only bots have acted, and warns or fails at the staleness thresholds. Bot
 * activity never counts, since bots keep abandoned pull requests looking alive.
 */
export function checkStaleness(snapshot: PrSnapshot, context: CheckContext): CheckResult {
  const { staleWarnDays, staleFailDays } = context.thresholds;
  const humanActivity = snapshot.activity.filter((activity) => !activity.isBot);
  const latest = humanActivity.at(-1);
  const since = latest?.at ?? snapshot.createdAt;
  const days = daysBetween(since, context.now);
  const evidence = [
    latest
      ? `last human activity: ${latest.kind} by ${latest.actor} on ${isoDate(latest.at)}, ${days} days ago`
      : `no human activity since #${snapshot.number} opened on ${isoDate(snapshot.createdAt)}, ${days} days ago`,
  ];

  let status: CheckStatus = 'pass';
  if (days >= staleFailDays) {
    status = 'fail';
  } else if (days >= staleWarnDays) {
    status = 'warn';
  }

  return {
    id: 'staleness',
    title: 'Staleness',
    status,
    summary: `${days} days since the last human activity.`,
    evidence,
  };
}
