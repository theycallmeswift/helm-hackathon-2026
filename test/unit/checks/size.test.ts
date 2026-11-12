import { describe, expect, test } from 'vitest';

import type { CheckStatus } from '../../../src/pr/types.ts';
import { makeFile, makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('size check', () => {
  test.each<{
    additions: number;
    deletions: number;
    status: CheckStatus;
    summary: string;
  }>([
    { additions: 60, deletions: 39, status: 'info', summary: 'Small: 99 changed lines.' },
    { additions: 60, deletions: 40, status: 'info', summary: 'Medium: 100 changed lines.' },
    { additions: 400, deletions: 99, status: 'info', summary: 'Medium: 499 changed lines.' },
    {
      additions: 400,
      deletions: 100,
      status: 'warn',
      summary: 'Large: 500 changed lines, at or above 500.',
    },
  ])('reports +$additions -$deletions as $summary', ({ additions, deletions, status, summary }) => {
    const files = [
      makeFile({ additions, deletions: 0 }),
      makeFile({ path: 'docs/a.md', additions: 0, deletions }),
    ];

    const result = runCheck('size', makePrSnapshot({ files }));

    expect(result.status).toBe(status);
    expect(result.summary).toBe(summary);
    expect(result.evidence).toEqual([
      `${additions + deletions} lines changed (+${additions} -${deletions}) across 2 files`,
    ]);
  });

  test('honors an overridden large threshold', () => {
    const files = [makeFile({ additions: 50, deletions: 0 })];

    const result = runCheck('size', makePrSnapshot({ files }), { largeSizeLines: 50 });

    expect(result.status).toBe('warn');
  });
});
