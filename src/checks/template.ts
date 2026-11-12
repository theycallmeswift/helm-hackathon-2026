/** The template check: the author filled in the pull request template's description section. */

import type { CheckResult, PrSnapshot } from '../pr/types.ts';

const DESCRIPTION_HEADING = '**What this PR does / why we need it**:';
const NEXT_HEADING = /^\*\*[^*\n]+\*\*:/m;
const UNCHECKED_BOX = /^\s*[-*] \[ \]/gm;
const CHECKED_BOX = /^\s*[-*] \[[xX]\]/gm;

/**
 * The text under the template's description heading, up to the next bold
 * `**…**:` heading or the end of the body, trimmed. `undefined` when the body
 * has no such heading.
 */
function descriptionSection(body: string): string | undefined {
  const headingAt = body.indexOf(DESCRIPTION_HEADING);
  if (headingAt === -1) {
    return undefined;
  }

  const rest = body.slice(headingAt + DESCRIPTION_HEADING.length);
  const nextHeadingAt = rest.search(NEXT_HEADING);
  return (nextHeadingAt === -1 ? rest : rest.slice(0, nextHeadingAt)).trim();
}

/** How many template checkboxes are checked, as evidence; it never decides the verdict. */
function checkboxEvidence(body: string): string {
  const unchecked = body.match(UNCHECKED_BOX)?.length ?? 0;
  const checked = body.match(CHECKED_BOX)?.length ?? 0;
  return `${checked} of ${unchecked + checked} checkboxes checked`;
}

/**
 * Warns when the body is empty, or when its description section is missing
 * or empty. Unchecked boxes alone don't warn: the template's boxes are "if
 * applicable", so a filled-in description with none checked is complete.
 */
export function checkTemplate(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'template', title: 'Template' } as const;
  const section = descriptionSection(snapshot.body);
  const boxes = checkboxEvidence(snapshot.body);

  if (snapshot.body.trim() === '') {
    return {
      ...result,
      status: 'warn',
      summary: 'The description is empty.',
      evidence: [`#${snapshot.number} has no description`],
    };
  }

  if (section === undefined) {
    return {
      ...result,
      status: 'warn',
      summary: 'The template description section is missing.',
      evidence: [`#${snapshot.number} has no ${DESCRIPTION_HEADING} section`, boxes],
    };
  }

  if (section === '') {
    return {
      ...result,
      status: 'warn',
      summary: 'The template description section is empty.',
      evidence: [`#${snapshot.number} leaves ${DESCRIPTION_HEADING} empty`, boxes],
    };
  }

  return {
    ...result,
    status: 'pass',
    summary: 'The template description section is filled in.',
    evidence: [`${section.length} characters under ${DESCRIPTION_HEADING}`, boxes],
  };
}
