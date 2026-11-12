import { expect, test } from 'vitest';

import { parseLinkedIssues } from '../../../src/github/linked-issues.ts';

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
])('finds $expected in "$text"', ({ text, expected }) => {
  expect(parseLinkedIssues(text)).toEqual(expected);
});

test('combines the title and the body', () => {
  expect(parseLinkedIssues('fix: thing (#3)', 'Fixes #1')).toEqual([1, 3]);
});
