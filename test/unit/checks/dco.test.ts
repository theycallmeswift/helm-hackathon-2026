import { describe, expect, test } from 'vitest';

import type { CheckStatus, PrCommit } from '../../../src/pr/types.ts';
import { makeCommit, makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

const UNSIGNED = makeCommit({ sha: 'aaaaaaa1234', message: 'fix: no sign-off' });
const SIGNED_BY_OTHER = makeCommit({
  sha: 'bbbbbbb1234',
  message: 'fix: thing\n\nSigned-off-by: Bo <bo@example.com>',
});
const UNSIGNED_MERGE = makeCommit({ sha: 'ccccccc1234', message: 'Merge main', isMerge: true });

describe('dco check', () => {
  test.each<{ name: string; commits: PrCommit[]; status: CheckStatus; evidence: string[] }>([
    {
      name: 'passes when every commit signs off as its author',
      commits: [makeCommit({ sha: 'ddddddd1234' })],
      status: 'pass',
      evidence: ['ddddddd: signed off by ada@example.com'],
    },
    {
      name: 'ignores merge commits',
      commits: [makeCommit({ sha: 'ddddddd1234' }), UNSIGNED_MERGE],
      status: 'pass',
      evidence: ['ddddddd: signed off by ada@example.com'],
    },
    {
      name: 'matches the author email regardless of case',
      commits: [makeCommit({ sha: 'ddddddd1234', authorEmail: 'Ada@Example.com' })],
      status: 'pass',
      evidence: ['ddddddd: signed off by Ada@Example.com'],
    },
    {
      name: 'reports info when every commit is a merge commit',
      commits: [UNSIGNED_MERGE, UNSIGNED_MERGE],
      status: 'info',
      evidence: ['2 commits, all merge commits'],
    },
    {
      name: 'warns when the sign-off names a different email',
      commits: [SIGNED_BY_OTHER],
      status: 'warn',
      evidence: ['bbbbbbb: signed off as bo@example.com, authored by ada@example.com'],
    },
    {
      name: 'fails naming each commit without a sign-off',
      commits: [makeCommit(), UNSIGNED, SIGNED_BY_OTHER],
      status: 'fail',
      evidence: ['aaaaaaa: no Signed-off-by trailer'],
    },
  ])('$name', ({ commits, status, evidence }) => {
    const result = runCheck('dco', makePrSnapshot({ commits }));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual(evidence);
  });
});
