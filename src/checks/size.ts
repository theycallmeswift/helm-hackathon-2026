/** The size check: how many lines the pull request changes. */

import type { CheckResult, PrSnapshot } from '../pr/types.ts';
import type { CheckContext } from './context.ts';

/**
 * Reports total changed lines as `info`, bucketed small, medium, or large by
 * the thresholds, and warns when the change is large.
 */
export function checkSize(snapshot: PrSnapshot, context: CheckContext): CheckResult {
  const { mediumSizeLines, largeSizeLines } = context.thresholds;
  const additions = snapshot.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = snapshot.files.reduce((sum, file) => sum + file.deletions, 0);
  const total = additions + deletions;
  const evidence = [
    `${total} lines changed (+${additions} -${deletions}) across ${snapshot.files.length} files`,
  ];
  const result = { id: 'size', title: 'Size', evidence } as const;

  if (total >= largeSizeLines) {
    return {
      ...result,
      status: 'warn',
      summary: `Large: ${total} changed lines, at or above ${largeSizeLines}.`,
    };
  }

  const bucket = total >= mediumSizeLines ? 'Medium' : 'Small';
  return { ...result, status: 'info', summary: `${bucket}: ${total} changed lines.` };
}
