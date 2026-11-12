/**
 * Finds the issue numbers a pull request's title and body reference: every
 * same-repository `#N`, or only those a closing keyword such as `Fixes #10`
 * links, the way GitHub decides which issues a merge closes.
 */

/**
 * Text that never links an issue: fenced code blocks, inline code spans, HTML
 * comments, and `<details>` and `<blockquote>` blocks, where templates and bots
 * such as dependabot put pasted upstream release notes and commit lists.
 */
const NON_PROSE =
  /```[\s\S]*?```|`[^`\n]*`|<!--[\s\S]*?-->|<details\b[\s\S]*?<\/details>|<blockquote\b[\s\S]*?<\/blockquote>/gi;

/**
 * A same-repository `#N` reference. The lookbehind rules out `owner/repo#N`,
 * URL fragments, and HTML entities such as `&#39;`.
 */
const ISSUE_REFERENCE = /(?<![\w/&#])#(\d+)\b/g;

/**
 * A `#N` reference right after one of GitHub's closing keywords, with an
 * optional colon. Each reference needs its own keyword, as on GitHub, so
 * `Fixes #1, #2` closes only #1.
 */
const CLOSING_REFERENCE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi;

/**
 * Returns the unique issue numbers `texts` reference with or without a
 * closing keyword, in ascending order.
 */
export function parseReferencedIssues(...texts: string[]): number[] {
  return collectIssueNumbers(texts, ISSUE_REFERENCE);
}

/**
 * Returns the unique issue numbers `texts` link with a closing keyword, in
 * ascending order. A bare `#N` is a mention, such as prior art, not a claim
 * to fix that issue.
 */
export function parseClosingIssues(...texts: string[]): number[] {
  return collectIssueNumbers(texts, CLOSING_REFERENCE);
}

/**
 * The unique numbers `pattern`'s first group captures across the prose of
 * `texts`, ascending. Code, comments, and quoted blocks are left out first.
 */
function collectIssueNumbers(texts: string[], pattern: RegExp): number[] {
  const numbers = new Set<number>();
  for (const text of texts) {
    const prose = text.replace(NON_PROSE, ' ');
    for (const match of prose.matchAll(pattern)) {
      numbers.add(Number(match[1]));
    }
  }

  return [...numbers].sort((left, right) => left - right);
}
