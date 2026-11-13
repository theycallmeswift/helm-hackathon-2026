/** The linked-issue check: the pull request references an issue. */

import type { CheckResult, PrSnapshot } from '../pr/types.ts';

/** Passes with the issue numbers the fetcher found in the title or body; warns when there are none. */
export function checkLinkedIssue(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'linked-issue', title: 'Linked issue' } as const;

  if (snapshot.referencedIssues.length === 0) {
    return {
      ...result,
      status: 'warn',
      summary: 'No issue is referenced in the title or body.',
      evidence: [`#${snapshot.number} title and body reference no issue`],
    };
  }

  return {
    ...result,
    status: 'pass',
    summary: `References ${snapshot.referencedIssues.map((issue) => `#${issue}`).join(', ')}.`,
    evidence: snapshot.referencedIssues.map((issue) => `references issue #${issue}`),
  };
}
