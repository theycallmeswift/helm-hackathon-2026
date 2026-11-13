/** The duplicates check: other open pull requests that close the same issue. */

import type { CheckResult, PrSnapshot, RelatedPr } from '../pr/types.ts';
import { isoDate } from './context.ts';

/** One related pull request, with its author, age, and the issues both close. */
function describeRelatedPr(related: RelatedPr): string {
  const issues = related.sharedIssues.map((issue) => `#${issue}`).join(', ');
  return `#${related.number} by ${related.author}, opened ${isoDate(related.createdAt)}, also closes ${issues}: ${related.url}`;
}

/**
 * Warns when another open pull request closes one of the same issues. Without
 * a closing keyword reference there is nothing to compare, so it reports `info`.
 */
export function checkDuplicates(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'duplicates', title: 'Duplicates' } as const;
  const related = snapshot.relatedOpenPrs;

  if (related.length > 0) {
    return {
      ...result,
      status: 'warn',
      summary: `${related.length} other open pull requests close the same issue.`,
      evidence: related.map(describeRelatedPr),
    };
  }

  if (snapshot.closingIssues.length === 0) {
    return {
      ...result,
      status: 'info',
      summary: 'No closing issue reference to compare against other pull requests.',
      evidence: [`#${snapshot.number} closes no issue`],
    };
  }

  const issues = snapshot.closingIssues.map((issue) => `#${issue}`).join(', ');
  return {
    ...result,
    status: 'pass',
    summary: 'No other open pull request closes the same issue.',
    evidence: [`no other open pull request closes ${issues}`],
  };
}
