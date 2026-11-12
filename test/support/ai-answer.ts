/**
 * A factory for the JSON answer the model returns, shaped by the strict
 * schema: every field present, unused evidence fields null. The default cites
 * files from the default `makePrSnapshot`.
 */

/** One evidence item as the model returns it. */
export interface AnswerEvidence {
  file: string;
  hunk: string | null;
  quote: string | null;
}

/** A valid answer for the default snapshot; mutate the copy to vary it. */
export function validAnswer() {
  const evidence = (): AnswerEvidence[] => [
    { file: 'pkg/lint/rules/values.go', hunk: '@@ -10,6 +10,8 @@', quote: null },
  ];

  return {
    kind: {
      kind: 'bug',
      confidence: 'high',
      reason: 'Fixes a nil values crash.',
      evidence: evidence(),
    },
    breakingChange: {
      verdict: 'no',
      confidence: 'medium',
      reason: 'Only adds a nil guard inside an unexported function.',
      evidence: evidence(),
    },
    needsHip: {
      verdict: 'no',
      confidence: 'high',
      reason: 'A small bug fix.',
      evidence: evidence(),
    },
    summary: {
      summary: 'Treats an empty values file as valid instead of crashing.',
      reviewFocus: 'validateValues in pkg/lint/rules/values.go',
      evidence: evidence(),
    },
  };
}
