import { describe, expect, test } from 'vitest';

import type { CheckStatus } from '../../../src/pr/types.ts';
import { makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('linked-issue check', () => {
  test.each<{ name: string; linkedIssues: number[]; status: CheckStatus; evidence: string[] }>([
    {
      name: 'passes with each referenced issue',
      linkedIssues: [10, 12],
      status: 'pass',
      evidence: ['references issue #10', 'references issue #12'],
    },
    {
      name: 'warns when no issue is referenced',
      linkedIssues: [],
      status: 'warn',
      evidence: ['#42 title and body reference no issue'],
    },
  ])('$name', ({ linkedIssues, status, evidence }) => {
    const result = runCheck('linked-issue', makePrSnapshot({ linkedIssues }));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual(evidence);
  });
});
