/** Runs the checks over a snapshot and picks out one result, so each test names only its check. */

import type { CheckThresholds } from '../../../src/checks/context.ts';
import { runChecks } from '../../../src/checks/run.ts';
import type { CheckId, CheckResult, PrSnapshot } from '../../../src/pr/types.ts';
import { FACTORY_NOW } from '../../support/pr-snapshot.ts';

/** The result of check `id` for `snapshot`, as of `FACTORY_NOW`. */
export function runCheck(
  id: CheckId,
  snapshot: PrSnapshot,
  thresholds: Partial<CheckThresholds> = {},
): CheckResult {
  const result = runChecks(snapshot, { now: FACTORY_NOW, thresholds }).find(
    (candidate) => candidate.id === id,
  );
  if (!result) {
    throw new Error(`runChecks returned no result for ${id}`);
  }

  return result;
}
