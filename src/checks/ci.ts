/** The CI check: the head commit's overall check state. */

import type { CheckResult, CiCheck, CiConclusion, PrSnapshot } from '../pr/types.ts';
import { shortSha } from './context.ts';

const FAILING_CONCLUSIONS: readonly CiConclusion[] = ['failure', 'timed_out', 'cancelled'];
const WAITING_CONCLUSIONS: readonly CiConclusion[] = ['pending', 'action_required', 'stale'];

/** One check as `name: conclusion`. */
function describeCheck(check: CiCheck): string {
  return `${check.name}: ${check.conclusion}`;
}

/** Whether a check is the DCO app waiting on a maintainer, which is an approval, not a CI failure. */
function isDcoAwaitingApproval(check: CiCheck): boolean {
  return check.name.toLowerCase() === 'dco' && check.conclusion === 'action_required';
}

/**
 * Passes on green CI, fails naming each failing check, and reports `info`
 * while checks are pending or when there are none. It trusts `ci.state`, which
 * the fetcher derives from the checks.
 */
export function checkCi(snapshot: PrSnapshot): CheckResult {
  const { state, checks } = snapshot.ci;
  const result = { id: 'ci', title: 'CI' } as const;
  const commit = shortSha(snapshot.headSha);

  if (state === 'none') {
    return {
      ...result,
      status: 'info',
      summary: 'No CI has reported on the head commit.',
      evidence: [`no checks on ${commit}`],
    };
  }

  if (state === 'failure') {
    const failing = checks.filter((check) => FAILING_CONCLUSIONS.includes(check.conclusion));
    return {
      ...result,
      status: 'fail',
      summary: `CI failed: ${failing.map((check) => check.name).join(', ')}.`,
      evidence: failing.map(describeCheck),
    };
  }

  if (state === 'pending') {
    const waiting = checks.filter((check) => WAITING_CONCLUSIONS.includes(check.conclusion));
    const summary = waiting.some(isDcoAwaitingApproval)
      ? 'CI is waiting on DCO approval from a maintainer.'
      : 'CI is still running or waiting on approval.';
    return { ...result, status: 'info', summary, evidence: waiting.map(describeCheck) };
  }

  return {
    ...result,
    status: 'pass',
    summary: `All ${checks.length} checks passed.`,
    evidence: [`${checks.length} checks green on ${commit}`],
  };
}
