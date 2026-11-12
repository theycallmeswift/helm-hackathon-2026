import { describe, expect, test } from 'vitest';

import type { CheckStatus, PrCi } from '../../../src/pr/types.ts';
import { makeCiCheck, makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('ci check', () => {
  test.each<{
    name: string;
    ci: PrCi;
    status: CheckStatus;
    summary: string;
    evidence: string[];
  }>([
    {
      name: 'passes when every check is green',
      ci: { state: 'success', checks: [makeCiCheck(), makeCiCheck({ name: 'golangci-lint' })] },
      status: 'pass',
      summary: 'All 2 checks passed.',
      evidence: ['2 checks green on 1111111'],
    },
    {
      name: 'fails naming each failing check',
      ci: {
        state: 'failure',
        checks: [
          makeCiCheck(),
          makeCiCheck({ name: 'build-test', conclusion: 'failure' }),
          makeCiCheck({ name: 'golangci-lint', conclusion: 'timed_out' }),
        ],
      },
      status: 'fail',
      summary: 'CI failed: build-test, golangci-lint.',
      evidence: ['build-test: failure', 'golangci-lint: timed_out'],
    },
    {
      name: 'fails listing every check when none reports a failing conclusion',
      ci: { state: 'failure', checks: [makeCiCheck()] },
      status: 'fail',
      summary: 'CI failed, but no check reports a failing conclusion.',
      evidence: ['CI state failure on 1111111', 'build-test: success'],
    },
    {
      name: 'reads a DCO check awaiting approval as pending, not failing',
      ci: {
        state: 'pending',
        checks: [makeCiCheck(), makeCiCheck({ name: 'DCO', conclusion: 'action_required' })],
      },
      status: 'info',
      summary: 'CI is waiting on DCO approval from a maintainer.',
      evidence: ['DCO: action_required'],
    },
    {
      name: 'reports running checks as info',
      ci: { state: 'pending', checks: [makeCiCheck({ conclusion: 'pending' })] },
      status: 'info',
      summary: 'CI is still running or waiting on approval.',
      evidence: ['build-test: pending'],
    },
    {
      name: 'reports a commit with no checks as info',
      ci: { state: 'none', checks: [] },
      status: 'info',
      summary: 'No CI has reported on the head commit.',
      evidence: ['no checks on 1111111'],
    },
  ])('$name', ({ ci, status, summary, evidence }) => {
    const result = runCheck('ci', makePrSnapshot({ ci }));

    expect(result.status).toBe(status);
    expect(result.summary).toBe(summary);
    expect(result.evidence).toEqual(evidence);
  });
});
