import { expect, test } from 'vitest';

import { parseClosingIssues, parseReferencedIssues } from '../../../src/github/linked-issues.ts';

/** Upstream release notes as dependabot quotes them, trimmed to the shape that matters. */
const DEPENDABOT_BODY = [
  'Bumps [github.com/gofrs/flock](https://github.com/gofrs/flock) from 0.13.1 to 0.13.2.',
  '<details>',
  '<summary>Release notes</summary>',
  '<blockquote>',
  '<li>Fixes #42 by <a href="https://github.com/ldez">ldez</a> in <a href="https://redirect.github.com/gofrs/flock/pull/129">gofrs/flock#129</a></li>',
  '</blockquote>',
  '</details>',
  '<details>',
  '<summary>Commits</summary>',
  '<li>fix: tryCtx with context cancellation (<a href="https://redirect.github.com/gofrs/flock/issues/162">#162</a>)</li>',
  '</details>',
].join('\n');

test.each([
  { text: 'Fixes #10', expected: [10] },
  { text: 'fix #1, fixed #2, FIXES #3', expected: [1, 2, 3] },
  { text: 'close #4, closes #5, Closed #6', expected: [4, 5, 6] },
  { text: 'resolve #7, resolves #8, RESOLVED #9', expected: [7, 8, 9] },
  { text: 'Fixes: #11 and closes:  #12', expected: [11, 12] },
  { text: 'Fixes #13, #14', expected: [13] },
  { text: 'closes #12, refs #11 and #10', expected: [12] },
  { text: 'the same change (#31613) made for getter plugins', expected: [] },
  { text: 'Similar to #31613. refs #31500', expected: [] },
  { text: 'Fixes issue #31924', expected: [] },
  { text: 'fix(engine): support htpasswd (#31924)', expected: [] },
  { text: 'prefix #12 and hotfix #13', expected: [] },
  { text: 'Fixes `#32541`', expected: [] },
  { text: '```\nFixes #5\n```\nfixes #6', expected: [6] },
  { text: '<!-- Fixes #<issue number> or fixes #4 -->', expected: [] },
  { text: 'fixes helm/helm#32887', expected: [] },
  { text: '<blockquote>\nFixes #3\n</blockquote>\nFixes #4', expected: [4] },
  { text: DEPENDABOT_BODY, expected: [] },
])('closing references in "$text" are $expected', ({ text, expected }) => {
  expect(parseClosingIssues(text)).toEqual(expected);
});

test.each([
  { text: 'Fixes #10', expected: [10] },
  { text: 'closes #12, refs #11 and #10', expected: [10, 11, 12] },
  { text: '#7 at the start, #7 again', expected: [7] },
  { text: 'no references here, just 10 things', expected: [] },
  { text: 'upstream `#32541` is code', expected: [] },
  { text: '```\nFixes #5\n```\nreal #6', expected: [6] },
  { text: '<!-- Fixes #<issue number> or #4 -->', expected: [] },
  { text: 'see helm/helm#32887', expected: [] },
  { text: 'https://example.com/page#3 and &#39;', expected: [] },
  { text: '(#8)', expected: [8] },
  { text: DEPENDABOT_BODY, expected: [] },
])('references in "$text" are $expected', ({ text, expected }) => {
  expect(parseReferencedIssues(text)).toEqual(expected);
});

test('combines the title and the body', () => {
  const title = 'fix: thing (#3)';
  const body = 'Fixes #1';

  const closing = parseClosingIssues(title, body);
  const referenced = parseReferencedIssues(title, body);

  expect({ closing, referenced }).toEqual({ closing: [1], referenced: [1, 3] });
});
