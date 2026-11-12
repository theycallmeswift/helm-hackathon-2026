/**
 * Sorts pull requests into buckets by who must act next. Each pull request
 * lands in the first bucket whose rule matches, in `BUCKET_IDS` order, and
 * carries the reason that put it there. Pure: reads only the snapshot and its
 * check results.
 */

import type {
  AuthorAssociation,
  CheckId,
  CheckResult,
  PrReview,
  PrSnapshot,
  RelatedPr,
} from '../pr/types.ts';

/** Every bucket, in precedence order, which is also the order the queue prints them. */
export const BUCKET_IDS = [
  'draft',
  'duplicate',
  'stale',
  'needs-author',
  'needs-second-approval',
  'ready',
] as const;

/** The identifier of one bucket. */
export type BucketId = (typeof BUCKET_IDS)[number];

/** The heading each bucket prints under. */
export const BUCKET_TITLES: Record<BucketId, string> = {
  draft: 'Draft',
  duplicate: 'Duplicate',
  stale: 'Stale',
  'needs-author': 'Needs author',
  'needs-second-approval': 'Needs 2nd approval',
  ready: 'Ready for review',
};

/** Associations whose approval counts toward the two a merge needs. */
const MAINTAINER_ASSOCIATIONS: ReadonlySet<AuthorAssociation> = new Set([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
]);

/** Which bucket a pull request belongs in, and why. */
export interface BucketAssignment {
  bucket: BucketId;
  /** One short line per blocker or fact that put it there, most often just one. */
  reasons: string[];
}

/**
 * The bucket for `snapshot`, given its check results.
 *
 * @throws {Error} when a check the rules read is missing from `checks`.
 */
export function assignBucket(snapshot: PrSnapshot, checks: CheckResult[]): BucketAssignment {
  const status = (id: CheckId) => findCheck(checks, id).status;

  if (snapshot.isDraft) {
    return { bucket: 'draft', reasons: ['marked as draft'] };
  }

  const earlier = earliestEarlierDuplicate(snapshot);
  if (status('duplicates') === 'warn' && earlier !== undefined) {
    return { bucket: 'duplicate', reasons: [`duplicates earlier #${earlier.number}`] };
  }

  if (status('staleness') === 'fail') {
    return { bucket: 'stale', reasons: [findCheck(checks, 'staleness').summary] };
  }

  const authorBlockers = authorBlockerReasons(snapshot, status);
  if (authorBlockers.length > 0) {
    return { bucket: 'needs-author', reasons: authorBlockers };
  }

  const approvers = maintainerApprovers(snapshot.reviews);
  if (approvers.length === 1) {
    return { bucket: 'needs-second-approval', reasons: [`approved by ${approvers.join('')}`] };
  }

  const reason = approvers.length > 1 ? `approved by ${approvers.join(', ')}` : 'no blockers found';
  return { bucket: 'ready', reasons: [reason] };
}

/** The result for check `id`; the bucket rules cannot run without it. */
function findCheck(checks: CheckResult[], id: CheckId): CheckResult {
  const check = checks.find((candidate) => candidate.id === id);
  if (check === undefined) {
    throw new Error(`queue bucketing needs the ${id} check result, which is missing`);
  }

  return check;
}

/**
 * The earliest related pull request opened before this one, ties broken by
 * the lower number. The earliest in a cluster has none, so it is not a
 * duplicate.
 */
function earliestEarlierDuplicate(snapshot: PrSnapshot): RelatedPr | undefined {
  const opensBefore = (related: RelatedPr) =>
    related.createdAt.getTime() < snapshot.createdAt.getTime() ||
    (related.createdAt.getTime() === snapshot.createdAt.getTime() &&
      related.number < snapshot.number);

  return snapshot.relatedOpenPrs
    .filter(opensBefore)
    .sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.number - right.number,
    )[0];
}

/** Everything waiting on the author: DCO, conflicts, failing CI, and requested changes. */
function authorBlockerReasons(
  snapshot: PrSnapshot,
  status: (id: CheckId) => CheckResult['status'],
): string[] {
  const reasons: string[] = [];
  if (status('dco') === 'fail') {
    reasons.push('missing DCO sign-off');
  }
  if (status('conflicts') === 'fail') {
    reasons.push('merge conflicts');
  }
  if (status('ci') === 'fail') {
    reasons.push('failing CI');
  }
  const requesters = reviewersWhoseLatestVerdictIs(snapshot.reviews, 'changes_requested');
  if (requesters.length > 0) {
    reasons.push(`changes requested by ${requesters.join(', ')}`);
  }

  return reasons;
}

/** Maintainers whose standing verdict is an approval. */
function maintainerApprovers(reviews: PrReview[]): string[] {
  const maintainerReviews = reviews.filter(
    (review) => !review.isBot && MAINTAINER_ASSOCIATIONS.has(review.association),
  );

  return reviewersWhoseLatestVerdictIs(maintainerReviews, 'approved');
}

/**
 * Reviewers whose latest verdict is `state`. Comment-only reviews leave a
 * verdict standing, as on GitHub; a dismissal clears it.
 */
function reviewersWhoseLatestVerdictIs(
  reviews: PrReview[],
  state: 'approved' | 'changes_requested',
): string[] {
  const latestVerdicts = new Map<string, PrReview['state']>();
  for (const review of reviews) {
    if (review.state !== 'commented') {
      latestVerdicts.set(review.reviewer, review.state);
    }
  }

  return [...latestVerdicts]
    .filter(([, verdict]) => verdict === state)
    .map(([reviewer]) => reviewer)
    .sort();
}
