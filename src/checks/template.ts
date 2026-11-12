/** The template check: the author filled in the pull request template. */

import type { CheckResult, PrSnapshot } from '../pr/types.ts';

const UNCHECKED_BOX = /^\s*[-*] \[ \]/gm;
const CHECKED_BOX = /^\s*[-*] \[[xX]\]/gm;

/**
 * Warns when the body is empty, or when it has template checkboxes and none
 * is checked. A body without checkboxes passes: the author replaced the
 * template rather than ignoring it.
 */
export function checkTemplate(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'template', title: 'Template' } as const;
  const unchecked = snapshot.body.match(UNCHECKED_BOX)?.length ?? 0;
  const checked = snapshot.body.match(CHECKED_BOX)?.length ?? 0;
  const total = unchecked + checked;

  if (snapshot.body.trim() === '') {
    return {
      ...result,
      status: 'warn',
      summary: 'The description is empty.',
      evidence: [`#${snapshot.number} has no description`],
    };
  }

  if (total > 0 && checked === 0) {
    return {
      ...result,
      status: 'warn',
      summary: 'No template checkbox is checked.',
      evidence: [`0 of ${total} checkboxes checked`],
    };
  }

  if (total === 0) {
    return {
      ...result,
      status: 'pass',
      summary: 'The description has no template checkboxes.',
      evidence: [`0 checkboxes in a ${snapshot.body.length}-character description`],
    };
  }

  return {
    ...result,
    status: 'pass',
    summary: `${checked} of ${total} template checkboxes are checked.`,
    evidence: [`${checked} of ${total} checkboxes checked`],
  };
}
