import { expect, test } from 'vitest';

import { findRelatedPrs, type OpenPr } from '../../../src/github/open-prs.ts';

/** An open pull request closing `closingIssues`, with defaults for the rest. */
function openPr(number: number, closingIssues: number[]): OpenPr {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/octo/helm/pull/${number}`,
    author: 'octocat',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    closingIssues,
  };
}

test.each([
  { closingIssues: [10], others: [openPr(2, [10])], expected: [[2, [10]]] },
  { closingIssues: [10, 11], others: [openPr(2, [11, 12])], expected: [[2, [11]]] },
  { closingIssues: [10], others: [openPr(1, [10])], expected: [] },
  { closingIssues: [10], others: [openPr(2, [12])], expected: [] },
  { closingIssues: [], others: [openPr(2, [10])], expected: [] },
  {
    closingIssues: [10],
    others: [openPr(5, [10]), openPr(3, [10]), openPr(3, [10])],
    expected: [
      [3, [10]],
      [5, [10]],
    ],
  },
])('PR 1 linking $closingIssues relates to $expected', ({ closingIssues, others, expected }) => {
  const related = findRelatedPrs(1, closingIssues, others);

  expect(related.map((pr) => [pr.number, pr.sharedIssues])).toEqual(expected);
});
