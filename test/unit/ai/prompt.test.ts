import { describe, expect, test } from 'vitest';

import { buildPrompt, CHARS_PER_TOKEN, fitPatches } from '../../../src/ai/prompt.ts';
import { makeFile, makePrSnapshot } from '../../support/pr-snapshot.ts';

/** A patch of exactly `length` characters. */
function patchOf(length: number): string {
  return `@@ -1 +1 @@\n${'x'.repeat(length - 12)}`;
}

const BUDGET_TOKENS = 10;
const BUDGET_CHARS = BUDGET_TOKENS * CHARS_PER_TOKEN;

describe('fitPatches', () => {
  test.each([
    {
      name: 'sends a patch under the budget whole',
      lengths: [BUDGET_CHARS - 1],
      expected: [{ cut: 'whole', length: BUDGET_CHARS - 1 }],
      truncated: false,
    },
    {
      name: 'sends patches exactly at the budget whole',
      lengths: [BUDGET_CHARS / 2, BUDGET_CHARS / 2],
      expected: [
        { cut: 'whole', length: BUDGET_CHARS / 2 },
        { cut: 'whole', length: BUDGET_CHARS / 2 },
      ],
      truncated: false,
    },
    {
      name: 'cuts a patch one character over the budget',
      lengths: [BUDGET_CHARS + 1],
      expected: [{ cut: 'truncated', length: BUDGET_CHARS }],
      truncated: true,
    },
    {
      name: 'cuts the patch that crosses the budget and omits the rest',
      lengths: [BUDGET_CHARS - 15, 20, 20],
      expected: [
        { cut: 'whole', length: BUDGET_CHARS - 15 },
        { cut: 'truncated', length: 15 },
        { cut: 'omitted', length: 0 },
      ],
      truncated: true,
    },
  ])('$name', ({ lengths, expected, truncated }) => {
    const files = lengths.map((length, index) =>
      makeFile({ path: `pkg/file${index}.go`, patch: patchOf(length) }),
    );

    const fitted = fitPatches(files, BUDGET_TOKENS);

    expect(fitted.files.map(({ cut, patch }) => ({ cut, length: patch.length }))).toEqual(expected);
    expect(fitted.truncated).toBe(truncated);
  });

  test('marks a file with no patch as unavailable without using budget', () => {
    const { patch: _, ...binaryFile } = makeFile({ path: 'docs/logo.png' });
    const files = [binaryFile, makeFile({ patch: patchOf(BUDGET_CHARS) })];

    const fitted = fitPatches(files, BUDGET_TOKENS);

    expect(fitted.files.map(({ cut }) => cut)).toEqual(['unavailable', 'whole']);
    expect(fitted.truncated).toBe(false);
  });
});

describe('buildPrompt', () => {
  test('keeps every file header and says so when patches were cut', () => {
    const snapshot = makePrSnapshot({
      files: [
        makeFile({ path: 'pkg/a.go', patch: patchOf(BUDGET_CHARS) }),
        makeFile({ path: 'pkg/b.go', patch: patchOf(30) }),
      ],
    });

    const prompt = buildPrompt(snapshot, BUDGET_TOKENS);

    expect(prompt.truncated).toBe(true);
    expect(prompt.user).toContain('### pkg/a.go (modified, +3 -1)');
    expect(prompt.user).toContain('### pkg/b.go (modified, +3 -1)\n[patch omitted: over budget]');
    expect(prompt.user).toContain('the diff exceeded the 10-token budget');
  });
});
