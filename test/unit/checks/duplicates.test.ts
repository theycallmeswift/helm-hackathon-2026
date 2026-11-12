import { describe, expect, test } from 'vitest';

import type { CheckStatus, PrSnapshot } from '../../../src/pr/types.ts';
import { makePrSnapshot, makeRelatedPr } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('duplicates check', () => {
  test.each<{
    name: string;
    overrides: Partial<PrSnapshot>;
    status: CheckStatus;
    evidence: string[];
  }>([
    {
      name: 'passes when no other open pull request shares an issue',
      overrides: { closingIssues: [10], relatedOpenPrs: [] },
      status: 'pass',
      evidence: ['no other open pull request closes #10'],
    },
    {
      name: 'warns listing each related pull request and the shared issue',
      overrides: { relatedOpenPrs: [makeRelatedPr()] },
      status: 'warn',
      evidence: [
        '#41 by someone-else, opened 2026-11-07, also closes #10: https://github.com/helm/helm/pull/41',
      ],
    },
    {
      name: 'reports info when there is no closing issue reference to compare',
      overrides: { closingIssues: [], relatedOpenPrs: [] },
      status: 'info',
      evidence: ['#42 closes no issue'],
    },
  ])('$name', ({ overrides, status, evidence }) => {
    const result = runCheck('duplicates', makePrSnapshot(overrides));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual(evidence);
  });
});
