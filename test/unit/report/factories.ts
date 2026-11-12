/**
 * Test data factories for readiness reports. Every field has a default, so a
 * test names only what it is about. The default report has every check
 * passing and AI flags present.
 */

import type {
  AiFlags,
  AiOutcome,
  CheckId,
  CheckResult,
  CheckStatus,
  ReadinessReport,
} from '../../../src/pr/types.ts';
import { CHECK_IDS } from '../../../src/pr/types.ts';

/** A passing check with one evidence line. */
export function makeCheck(overrides: Partial<CheckResult> & { id: CheckId }): CheckResult {
  return {
    title: overrides.id,
    status: 'pass',
    summary: `${overrides.id} looks good`,
    evidence: [`${overrides.id} evidence`],
    ...overrides,
  };
}

/** One check per id, in report order, each with the given status. */
export function makeChecks(status: CheckStatus = 'pass'): CheckResult[] {
  return CHECK_IDS.map((id) => makeCheck({ id, status }));
}

/** Flags for a small bug fix, each grounded in the diff. */
export function makeAiFlags(overrides: Partial<AiFlags> = {}): AiFlags {
  return {
    kind: {
      kind: 'bug',
      confidence: 'high',
      reason: 'fixes a nil dereference',
      evidence: [{ file: 'pkg/lint/rules/values.go', hunk: '@@ -10,6 +10,8 @@' }],
    },
    breakingChange: {
      verdict: 'possible',
      confidence: 'medium',
      reason: 'changes a pkg/action flag default',
      evidence: [{ file: 'pkg/action/install.go', quote: 'Wait: true' }],
    },
    needsHip: {
      verdict: 'no',
      confidence: 'high',
      reason: 'a local fix',
      evidence: [{ file: 'pkg/lint/rules/values.go', hunk: '@@ -10,6 +10,8 @@' }],
    },
    summary: {
      summary: 'fixes nil deref in lint when values file is empty',
      reviewFocus: 'pkg/lint/rules/values.go',
      evidence: [{ file: 'pkg/lint/rules/values.go', hunk: '@@ -10,6 +10,8 @@' }],
    },
    ...overrides,
  };
}

/** An AI outcome that ran and returned the default flags. */
export function makeOkAi(): AiOutcome {
  return { status: 'ok', model: 'anthropic/claude-sonnet-5.5', flags: makeAiFlags() };
}

/** A report on helm/helm#32887 with every check passing and AI flags present. */
export function makeReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    pr: {
      repo: 'helm/helm',
      number: 32887,
      title: 'fix(lint): handle an empty values file',
      url: 'https://github.com/helm/helm/pull/32887',
      headSha: 'abcdef1234567890abcdef1234567890abcdef12',
    },
    checks: makeChecks(),
    ai: makeOkAi(),
    ...overrides,
  };
}
