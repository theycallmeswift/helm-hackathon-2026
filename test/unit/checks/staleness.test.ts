import { describe, expect, test } from 'vitest';

import type { CheckStatus, PrActivity } from '../../../src/pr/types.ts';
import { daysAgo, makeActivity, makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

const BOT_COMMENT_TODAY = makeActivity({
  at: daysAgo(0),
  actor: 'github-actions[bot]',
  isBot: true,
});

describe('staleness check', () => {
  test.each<{
    name: string;
    activity: PrActivity[];
    createdAt: Date;
    status: CheckStatus;
    evidence: string[];
  }>([
    {
      name: 'passes with recent human activity',
      activity: [makeActivity({ at: daysAgo(29), actor: 'ada' })],
      createdAt: daysAgo(40),
      status: 'pass',
      evidence: ['last human activity: comment by ada on 2026-10-14, 29 days ago'],
    },
    {
      name: 'warns at 30 days without human activity',
      activity: [makeActivity({ at: daysAgo(30), actor: 'ada', kind: 'commit' })],
      createdAt: daysAgo(40),
      status: 'warn',
      evidence: ['last human activity: commit by ada on 2026-10-13, 30 days ago'],
    },
    {
      name: 'fails at 90 days without human activity',
      activity: [makeActivity({ at: daysAgo(90), actor: 'maintainer', kind: 'review' })],
      createdAt: daysAgo(120),
      status: 'fail',
      evidence: ['last human activity: review by maintainer on 2026-08-14, 90 days ago'],
    },
    {
      name: 'ignores recent bot activity after old human activity',
      activity: [makeActivity({ at: daysAgo(95), actor: 'ada' }), BOT_COMMENT_TODAY],
      createdAt: daysAgo(100),
      status: 'fail',
      evidence: ['last human activity: comment by ada on 2026-08-09, 95 days ago'],
    },
    {
      name: 'measures from creation when only bots have acted',
      activity: [BOT_COMMENT_TODAY],
      createdAt: daysAgo(45),
      status: 'warn',
      evidence: ['no human activity since #42 opened on 2026-09-28, 45 days ago'],
    },
  ])('$name', ({ activity, createdAt, status, evidence }) => {
    const result = runCheck('staleness', makePrSnapshot({ activity, createdAt }));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual(evidence);
  });
});
