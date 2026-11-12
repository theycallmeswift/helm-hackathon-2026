/**
 * Finds the issue numbers a pull request's title and body reference, through
 * closing keywords such as `Fixes #10` or a bare `#10`.
 */

/** Fenced code blocks, inline code spans, and HTML comments, which never link issues. */
const NON_PROSE = /```[\s\S]*?```|`[^`\n]*`|<!--[\s\S]*?-->/g;

/**
 * A same-repository `#N` reference. The lookbehind rules out `owner/repo#N`,
 * URL fragments, and HTML entities such as `&#39;`.
 */
const ISSUE_REFERENCE = /(?<![\w/&#])#(\d+)\b/g;

/**
 * Returns the unique issue numbers `texts` reference, in ascending order.
 * References inside code or HTML comments are ignored, since templates and
 * pasted upstream text put them there without meaning a link.
 */
export function parseLinkedIssues(...texts: string[]): number[] {
  const numbers = new Set<number>();
  for (const text of texts) {
    const prose = text.replace(NON_PROSE, ' ');
    for (const match of prose.matchAll(ISSUE_REFERENCE)) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers].sort((left, right) => left - right);
}
