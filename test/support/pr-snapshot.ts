/**
 * Test data factories for `PrSnapshot` and its parts. Every field has a
 * default, so a test names only what it is about. The defaults describe a
 * pull request that every check passes, with dates relative to `FACTORY_NOW`.
 */

import type {
  CiCheck,
  PrActivity,
  PrCommit,
  PrFile,
  PrReview,
  PrSnapshot,
  RelatedPr,
} from '../../src/pr/types.ts';

/** The "today" the default dates are relative to. Pass it as `now` to code that reads the clock. */
export const FACTORY_NOW = new Date('2026-11-12T12:00:00Z');

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The instant `days` days before `FACTORY_NOW`. */
export function daysAgo(days: number): Date {
  return new Date(FACTORY_NOW.getTime() - days * MILLISECONDS_PER_DAY);
}

/** A signed-off, non-merge commit made two days ago. */
export function makeCommit(overrides: Partial<PrCommit> = {}): PrCommit {
  return {
    sha: '1111111111111111111111111111111111111111',
    message:
      'fix(lint): handle an empty values file\n\nSigned-off-by: Ada Author <ada@example.com>',
    authorEmail: 'ada@example.com',
    committedAt: daysAgo(2),
    isMerge: false,
    ...overrides,
  };
}

/** A modified Go source file with a small patch. */
export function makeFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    path: 'pkg/lint/rules/values.go',
    status: 'modified',
    additions: 3,
    deletions: 1,
    patch:
      '@@ -10,6 +10,8 @@ func validateValues() {\n-\treturn nil\n+\tif values == nil {\n+\t\treturn nil\n+\t}',
    ...overrides,
  };
}

/** An approving review by a maintainer, one day ago. */
export function makeReview(overrides: Partial<PrReview> = {}): PrReview {
  return {
    reviewer: 'maintainer',
    isBot: false,
    state: 'approved',
    association: 'MEMBER',
    submittedAt: daysAgo(1),
    ...overrides,
  };
}

/** A human comment one day ago. */
export function makeActivity(overrides: Partial<PrActivity> = {}): PrActivity {
  return {
    at: daysAgo(1),
    actor: 'maintainer',
    isBot: false,
    kind: 'comment',
    ...overrides,
  };
}

/** A successful check run. */
export function makeCiCheck(overrides: Partial<CiCheck> = {}): CiCheck {
  return {
    name: 'build-test',
    conclusion: 'success',
    ...overrides,
  };
}

/** Another open pull request that shares issue 10. */
export function makeRelatedPr(overrides: Partial<RelatedPr> = {}): RelatedPr {
  return {
    number: 41,
    title: 'fix: another take on the same bug',
    url: 'https://github.com/helm/helm/pull/41',
    author: 'someone-else',
    createdAt: daysAgo(5),
    sharedIssues: [10],
    ...overrides,
  };
}

/** A ready pull request: signed off, clean, green CI, linked issue, tests touched, recent human activity. */
export function makePrSnapshot(overrides: Partial<PrSnapshot> = {}): PrSnapshot {
  return {
    repo: 'helm/helm',
    number: 42,
    title: 'fix(lint): handle an empty values file',
    body: 'Closes #10\n\n- [x] this PR has tests\n- [x] this PR has been signed off',
    url: 'https://github.com/helm/helm/pull/42',
    isDraft: false,
    author: { login: 'ada', isBot: false, association: 'CONTRIBUTOR' },
    createdAt: daysAgo(3),
    baseRef: 'main',
    headSha: '1111111111111111111111111111111111111111',
    labels: [],
    referencedIssues: [10],
    closingIssues: [10],
    mergeableState: 'clean',
    commits: [makeCommit()],
    files: [
      makeFile(),
      makeFile({
        path: 'pkg/lint/rules/values_test.go',
        additions: 12,
        deletions: 0,
        patch: '@@ -1,3 +1,15 @@\n+func TestEmptyValues(t *testing.T) {}',
      }),
    ],
    reviews: [],
    activity: [makeActivity({ at: daysAgo(2), actor: 'ada', kind: 'commit' }), makeActivity()],
    ci: { state: 'success', checks: [makeCiCheck(), makeCiCheck({ name: 'DCO' })] },
    relatedOpenPrs: [],
    ...overrides,
  };
}
