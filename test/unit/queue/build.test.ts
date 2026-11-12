import { expect, test } from 'vitest';

import { groupIntoSections, toEntry } from '../../../src/queue/build.ts';
import { daysAgo, FACTORY_NOW, makeCommit, makePrSnapshot } from '../../support/pr-snapshot.ts';

test('a bucket lists its PRs oldest waiting first, waiting since the later of creation and head commit', () => {
  const entries = [
    makePrSnapshot({
      number: 1,
      createdAt: daysAgo(20),
      commits: [makeCommit({ committedAt: daysAgo(2) })],
    }),
    makePrSnapshot({
      number: 2,
      createdAt: daysAgo(5),
      commits: [makeCommit({ committedAt: daysAgo(6) })],
    }),
    makePrSnapshot({
      number: 3,
      createdAt: daysAgo(10),
      commits: [makeCommit({ committedAt: daysAgo(4) })],
    }),
    makePrSnapshot({ number: 4, createdAt: daysAgo(5), commits: [] }),
  ].map((snapshot) => toEntry(snapshot, FACTORY_NOW));

  const sections = groupIntoSections(entries);

  const ready = sections.find((section) => section.bucket === 'ready');
  expect(ready?.entries.map((entry) => [entry.snapshot.number, entry.waitingSince])).toEqual([
    [2, daysAgo(5)],
    [4, daysAgo(5)],
    [3, daysAgo(4)],
    [1, daysAgo(2)],
  ]);
});

test('every bucket is listed in precedence order, empty ones included', () => {
  const entries = [makePrSnapshot({ isDraft: true })].map((snapshot) =>
    toEntry(snapshot, FACTORY_NOW),
  );

  const sections = groupIntoSections(entries);

  expect(sections.map((section) => [section.bucket, section.entries.length])).toEqual([
    ['draft', 1],
    ['duplicate', 0],
    ['stale', 0],
    ['needs-author', 0],
    ['needs-second-approval', 0],
    ['ready', 0],
  ]);
});
