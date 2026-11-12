import { describe, expect, test } from 'vitest';

import type { CheckStatus, MergeableState } from '../../../src/pr/types.ts';
import { makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('conflicts check', () => {
  test.each<{ state: MergeableState; status: CheckStatus }>([
    { state: 'clean', status: 'pass' },
    { state: 'blocked', status: 'pass' },
    { state: 'unstable', status: 'pass' },
    { state: 'behind', status: 'pass' },
    { state: 'unknown', status: 'info' },
    { state: 'dirty', status: 'fail' },
  ])('reports $state as $status', ({ state, status }) => {
    const result = runCheck('conflicts', makePrSnapshot({ mergeableState: state }));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual([`mergeable_state is ${state} against main`]);
  });
});
