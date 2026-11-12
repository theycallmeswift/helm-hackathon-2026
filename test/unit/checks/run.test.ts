import { describe, expect, test } from 'vitest';

import { runChecks } from '../../../src/checks/run.ts';
import { CHECK_IDS } from '../../../src/pr/types.ts';
import { FACTORY_NOW, makePrSnapshot } from '../../support/pr-snapshot.ts';

describe('runChecks', () => {
  test('returns one result per check in report order', () => {
    const results = runChecks(makePrSnapshot(), { now: FACTORY_NOW });

    expect(results.map((result) => result.id)).toEqual([...CHECK_IDS]);
  });

  test('a ready pull request passes every judging check', () => {
    const results = runChecks(makePrSnapshot(), { now: FACTORY_NOW });

    expect(results.filter((result) => result.status !== 'pass').map((result) => result.id)).toEqual(
      ['size'],
    );
  });

  test('every result carries evidence', () => {
    const results = runChecks(makePrSnapshot(), { now: FACTORY_NOW });

    for (const result of results) {
      expect(result.evidence, result.id).not.toEqual([]);
    }
  });
});
