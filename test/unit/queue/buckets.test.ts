import { expect, test } from 'vitest';

import { runChecks } from '../../../src/checks/run.ts';
import type { PrSnapshot } from '../../../src/pr/types.ts';
import { assignBucket } from '../../../src/queue/buckets.ts';
import {
  daysAgo,
  FACTORY_NOW,
  makeActivity,
  makeCommit,
  makePrSnapshot,
  makeRelatedPr,
  makeReview,
} from '../../support/pr-snapshot.ts';

/** Snapshot fields that make one bucket rule match. */
const DRAFT: Partial<PrSnapshot> = { isDraft: true };
const CONFLICTS: Partial<PrSnapshot> = { mergeableState: 'dirty' };
const FAILING_CI: Partial<PrSnapshot> = {
  ci: { state: 'failure', checks: [{ name: 'build-test', conclusion: 'failure' }] },
};
const STALE: Partial<PrSnapshot> = {
  createdAt: daysAgo(120),
  commits: [makeCommit({ committedAt: daysAgo(120) })],
  activity: [makeActivity({ at: daysAgo(100) })],
};
const LATER_DUPLICATE: Partial<PrSnapshot> = {
  relatedOpenPrs: [makeRelatedPr({ number: 41, createdAt: daysAgo(10) })],
};

/** The bucket and reasons `snapshot` gets with the real checks run at `FACTORY_NOW`. */
function bucketOf(overrides: Partial<PrSnapshot>) {
  const snapshot = makePrSnapshot(overrides);

  return assignBucket(snapshot, runChecks(snapshot, { now: FACTORY_NOW }));
}

test.each([
  {
    name: 'a draft',
    overrides: DRAFT,
    bucket: 'draft',
    reasons: [{ kind: 'draft', text: 'marked as draft' }],
  },
  {
    name: 'a later PR sharing an issue',
    overrides: LATER_DUPLICATE,
    bucket: 'duplicate',
    reasons: [{ kind: 'duplicate', text: 'duplicates earlier #41' }],
  },
  {
    name: 'a PR idle past the fail threshold',
    overrides: STALE,
    bucket: 'stale',
    reasons: [{ kind: 'stale', text: '100 days since the last human activity.' }],
  },
  {
    name: 'a PR missing a sign-off',
    overrides: { commits: [makeCommit({ message: 'fix: no trailer' })] },
    bucket: 'needs-author',
    reasons: [{ kind: 'dco', text: 'missing DCO sign-off' }],
  },
  {
    name: 'a PR with conflicts',
    overrides: CONFLICTS,
    bucket: 'needs-author',
    reasons: [{ kind: 'conflicts', text: 'merge conflicts' }],
  },
  {
    name: 'a PR with failing CI',
    overrides: FAILING_CI,
    bucket: 'needs-author',
    reasons: [{ kind: 'ci', text: 'failing CI' }],
  },
  {
    name: 'a PR with requested changes',
    overrides: { reviews: [makeReview({ reviewer: 'reviewer-a', state: 'changes_requested' })] },
    bucket: 'needs-author',
    reasons: [{ kind: 'changes-requested', text: 'changes requested by reviewer-a' }],
  },
  {
    name: 'a PR with conflicts and failing CI',
    overrides: { ...CONFLICTS, ...FAILING_CI },
    bucket: 'needs-author',
    reasons: [
      { kind: 'conflicts', text: 'merge conflicts' },
      { kind: 'ci', text: 'failing CI' },
    ],
  },
  {
    name: 'a PR with one maintainer approval',
    overrides: { reviews: [makeReview({ reviewer: 'maintainer-a' })] },
    bucket: 'needs-second-approval',
    reasons: [{ kind: 'approved', text: 'approved by maintainer-a' }],
  },
  {
    name: 'a PR approved by one maintainer and one contributor',
    overrides: {
      reviews: [
        makeReview({ reviewer: 'maintainer-a' }),
        makeReview({ reviewer: 'fan', association: 'CONTRIBUTOR' }),
      ],
    },
    bucket: 'needs-second-approval',
    reasons: [{ kind: 'approved', text: 'approved by maintainer-a' }],
  },
  {
    name: 'a PR with two maintainer approvals',
    overrides: {
      reviews: [makeReview({ reviewer: 'maintainer-a' }), makeReview({ reviewer: 'maintainer-b' })],
    },
    bucket: 'ready',
    reasons: [{ kind: 'approved', text: 'approved by maintainer-a, maintainer-b' }],
  },
  {
    name: 'a PR whose requested changes were later approved',
    overrides: {
      reviews: [
        makeReview({
          reviewer: 'maintainer-a',
          state: 'changes_requested',
          submittedAt: daysAgo(2),
        }),
        makeReview({ reviewer: 'maintainer-a', state: 'commented', submittedAt: daysAgo(1.5) }),
        makeReview({ reviewer: 'maintainer-a', state: 'approved', submittedAt: daysAgo(1) }),
      ],
    },
    bucket: 'needs-second-approval',
    reasons: [{ kind: 'approved', text: 'approved by maintainer-a' }],
  },
  {
    name: 'a PR whose only approval was dismissed',
    overrides: {
      reviews: [
        makeReview({ reviewer: 'maintainer-a', submittedAt: daysAgo(2) }),
        makeReview({ reviewer: 'maintainer-a', state: 'dismissed', submittedAt: daysAgo(1) }),
      ],
    },
    bucket: 'ready',
    reasons: [{ kind: 'no-blockers', text: 'no blockers found' }],
  },
  {
    name: 'a PR with no reviews and no blockers',
    overrides: {},
    bucket: 'ready',
    reasons: [{ kind: 'no-blockers', text: 'no blockers found' }],
  },
])('$name lands in $bucket', ({ overrides, bucket, reasons }) => {
  const assignment = bucketOf(overrides);

  expect(assignment).toEqual({ bucket, reasons });
});

test.each([
  {
    name: 'a draft with conflicts is Draft',
    overrides: { ...DRAFT, ...CONFLICTS },
    bucket: 'draft',
  },
  { name: 'a stale draft is Draft', overrides: { ...DRAFT, ...STALE }, bucket: 'draft' },
  {
    name: 'a stale later duplicate is Duplicate',
    overrides: { ...STALE, ...LATER_DUPLICATE, createdAt: daysAgo(9) },
    bucket: 'duplicate',
  },
  {
    name: 'a stale PR with failing CI is Stale',
    overrides: { ...STALE, ...FAILING_CI },
    bucket: 'stale',
  },
  {
    name: 'a PR with one approval and failing CI is Needs author',
    overrides: { ...FAILING_CI, reviews: [makeReview()] },
    bucket: 'needs-author',
  },
])('$name', ({ overrides, bucket }) => {
  const assignment = bucketOf(overrides);

  expect(assignment.bucket).toBe(bucket);
});

test.each([
  { number: 40, createdAt: daysAgo(10), bucket: 'ready' },
  { number: 41, createdAt: daysAgo(8), bucket: 'duplicate' },
  { number: 42, createdAt: daysAgo(6), bucket: 'duplicate' },
])(
  'in a cluster of #40, #41 and #42 only the earliest stays out of Duplicate: #$number is $bucket',
  ({ number, createdAt, bucket }) => {
    const cluster = [
      makeRelatedPr({ number: 40, createdAt: daysAgo(10) }),
      makeRelatedPr({ number: 41, createdAt: daysAgo(8) }),
      makeRelatedPr({ number: 42, createdAt: daysAgo(6) }),
    ];

    const assignment = bucketOf({
      number,
      createdAt,
      relatedOpenPrs: cluster.filter((related) => related.number !== number),
    });

    expect(assignment.bucket).toBe(bucket);
  },
);
