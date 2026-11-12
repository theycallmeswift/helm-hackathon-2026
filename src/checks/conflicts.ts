/** The conflicts check: whether the branch merges cleanly into its base. */

import type { CheckResult, PrSnapshot } from '../pr/types.ts';

/**
 * Fails on merge conflicts and reports `info` while GitHub is still
 * computing. Every other state passes: `blocked` means branch protection is
 * waiting on reviews or checks, which is not a defect of the pull request.
 */
export function checkConflicts(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'conflicts', title: 'Conflicts' } as const;
  const evidence = [`mergeable_state is ${snapshot.mergeableState} against ${snapshot.baseRef}`];

  if (snapshot.mergeableState === 'dirty') {
    return { ...result, status: 'fail', summary: 'The branch has merge conflicts.', evidence };
  }

  if (snapshot.mergeableState === 'unknown') {
    return {
      ...result,
      status: 'info',
      summary: 'GitHub has not finished computing mergeability.',
      evidence,
    };
  }

  return { ...result, status: 'pass', summary: 'The branch merges without conflicts.', evidence };
}
