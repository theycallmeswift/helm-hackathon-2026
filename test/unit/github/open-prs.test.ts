import { expect, test } from 'vitest';

import { findRelatedPrs, type OpenPr } from '../../../src/github/open-prs.ts';

/** An open pull request referencing `linkedIssues`, with defaults for the rest. */
function openPr(number: number, linkedIssues: number[]): OpenPr {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/octo/helm/pull/${number}`,
    author: 'octocat',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    linkedIssues,
  };
}

test.each([
  { linkedIssues: [10], others: [openPr(2, [10])], expected: [[2, [10]]] },
  { linkedIssues: [10, 11], others: [openPr(2, [11, 12])], expected: [[2, [11]]] },
  { linkedIssues: [10], others: [openPr(1, [10])], expected: [] },
  { linkedIssues: [10], others: [openPr(2, [12])], expected: [] },
  { linkedIssues: [], others: [openPr(2, [10])], expected: [] },
  {
    linkedIssues: [10],
    others: [openPr(5, [10]), openPr(3, [10]), openPr(3, [10])],
    expected: [
      [3, [10]],
      [5, [10]],
    ],
  },
])('PR 1 linking $linkedIssues relates to $expected', ({ linkedIssues, others, expected }) => {
  const related = findRelatedPrs(1, linkedIssues, others);

  expect(related.map((pr) => [pr.number, pr.sharedIssues])).toEqual(expected);
});
