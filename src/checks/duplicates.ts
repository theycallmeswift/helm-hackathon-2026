/** The duplicates check: other open pull requests that target the same issue. */

import type { CheckResult, PrSnapshot, RelatedPr } from '../pr/types.ts';
import { isoDate } from './context.ts';

/** One related pull request, with its author, age, and the issues both reference. */
function describeRelatedPr(related: RelatedPr): string {
  const issues = related.sharedIssues.map((issue) => `#${issue}`).join(', ');
  return `#${related.number} by ${related.author}, opened ${isoDate(related.createdAt)}, also references ${issues}: ${related.url}`;
}

/**
 * Warns when another open pull request references one of the same issues.
 * Without a linked issue there is nothing to compare, so it reports `info`.
 */
export function checkDuplicates(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'duplicates', title: 'Duplicates' } as const;
  const related = snapshot.relatedOpenPrs;

  if (related.length > 0) {
    return {
      ...result,
      status: 'warn',
      summary: `${related.length} other open pull requests reference the same issue.`,
      evidence: related.map(describeRelatedPr),
    };
  }

  if (snapshot.linkedIssues.length === 0) {
    return {
      ...result,
      status: 'info',
      summary: 'No linked issue to compare against other pull requests.',
      evidence: [`#${snapshot.number} references no issue`],
    };
  }

  const issues = snapshot.linkedIssues.map((issue) => `#${issue}`).join(', ');
  return {
    ...result,
    status: 'pass',
    summary: 'No other open pull request references the same issue.',
    evidence: [`no other open pull request references ${issues}`],
  };
}
