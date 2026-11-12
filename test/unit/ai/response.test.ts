import { describe, expect, test } from 'vitest';

import { MalformedAnswerError, parseAiFlags } from '../../../src/ai/response.ts';
import { validAnswer } from '../../support/ai-answer.ts';
import { makePrSnapshot } from '../../support/pr-snapshot.ts';

const SNAPSHOT = makePrSnapshot();

describe('parseAiFlags', () => {
  test('turns a valid answer into flags, dropping null evidence fields', () => {
    const flags = parseAiFlags(JSON.stringify(validAnswer()), SNAPSHOT);

    expect(flags.kind).toEqual({
      kind: 'bug',
      confidence: 'high',
      reason: 'Fixes a nil values crash.',
      evidence: [{ file: 'pkg/lint/rules/values.go', hunk: '@@ -10,6 +10,8 @@' }],
    });
  });

  test('drops evidence citing a file outside the pull request but keeps the rest', () => {
    const answer = validAnswer();
    answer.summary.evidence.push({ file: 'pkg/elsewhere.go', hunk: null, quote: 'x' });

    const flags = parseAiFlags(JSON.stringify(answer), SNAPSHOT);

    expect(flags.summary.evidence.map((item) => item.file)).toEqual(['pkg/lint/rules/values.go']);
  });

  test.each([
    { name: 'not JSON', content: '{nope', message: 'not valid JSON' },
    {
      name: 'an unknown kind',
      content: JSON.stringify({ ...validAnswer(), kind: { ...validAnswer().kind, kind: 'epic' } }),
      message: 'kind.kind must be one of',
    },
    {
      name: 'a missing flag',
      content: JSON.stringify({ ...validAnswer(), needsHip: undefined }),
      message: 'needsHip is not an object',
    },
    {
      name: 'evidence with neither hunk nor quote',
      content: JSON.stringify({
        ...validAnswer(),
        kind: {
          ...validAnswer().kind,
          evidence: [{ file: 'pkg/lint/rules/values.go', hunk: null, quote: null }],
        },
      }),
      message: 'the kind flag cites no file the pull request changes',
    },
  ])('rejects $name', ({ content, message }) => {
    expect(() => parseAiFlags(content, SNAPSHOT)).toThrow(MalformedAnswerError);
    expect(() => parseAiFlags(content, SNAPSHOT)).toThrow(message);
  });
});
