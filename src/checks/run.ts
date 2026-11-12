/**
 * Runs every deterministic readiness check over one pull request snapshot.
 * The checks are pure: they read only the snapshot and the options, never
 * the network, the filesystem, or the clock.
 */

import { CHECK_IDS, type CheckId, type CheckResult, type PrSnapshot } from '../pr/types.ts';
import { checkCi } from './ci.ts';
import { checkConflicts } from './conflicts.ts';
import { type Check, type CheckOptions, DEFAULT_THRESHOLDS } from './context.ts';
import { checkDco } from './dco.ts';
import { checkDuplicates } from './duplicates.ts';
import { checkLinkedIssue } from './linked-issue.ts';
import { checkSize } from './size.ts';
import { checkStaleness } from './staleness.ts';
import { checkTemplate } from './template.ts';
import { checkTests } from './tests.ts';

const CHECKS: Record<CheckId, Check> = {
  dco: checkDco,
  conflicts: checkConflicts,
  ci: checkCi,
  'linked-issue': checkLinkedIssue,
  duplicates: checkDuplicates,
  template: checkTemplate,
  tests: checkTests,
  size: checkSize,
  staleness: checkStaleness,
};

/** Every check's result for `snapshot`, in `CHECK_IDS` order. */
export function runChecks(snapshot: PrSnapshot, options: CheckOptions): CheckResult[] {
  const context = {
    now: options.now,
    thresholds: { ...DEFAULT_THRESHOLDS, ...options.thresholds },
  };

  return CHECK_IDS.map((id) => CHECKS[id](snapshot, context));
}
