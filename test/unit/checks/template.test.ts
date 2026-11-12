import { describe, expect, test } from 'vitest';

import type { CheckStatus } from '../../../src/pr/types.ts';
import { makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

const IF_APPLICABLE_UNCHECKED = [
  '**If applicable**:',
  '- [ ] this PR contains user facing changes (the `docs needed` label should be applied if so)',
  '- [ ] this PR contains unit tests',
  '- [ ] this PR has been tested for backwards compatibility',
  '',
].join('\n');

describe('template check', () => {
  test.each<{ name: string; body: string; status: CheckStatus; evidence: string[] }>([
    {
      name: 'passes a filled-in description with every if-applicable box unchecked',
      body: `**What this PR does / why we need it**:\n\nImproves the dry-run doc comments.\n\n**Special notes for your reviewer**:\n\nComment-only change.\n\n${IF_APPLICABLE_UNCHECKED}`,
      status: 'pass',
      evidence: [
        '34 characters under **What this PR does / why we need it**:',
        '0 of 3 checkboxes checked',
      ],
    },
    {
      name: 'passes a description written directly under the heading',
      body: `**What this PR does / why we need it**:\nTreats a non-positive --max as unlimited.\n\n**Special notes for your reviewer**:\nLimited to getHistory.\n\n${IF_APPLICABLE_UNCHECKED}`,
      status: 'pass',
      evidence: [
        '41 characters under **What this PR does / why we need it**:',
        '0 of 3 checkboxes checked',
      ],
    },
    {
      name: 'passes a filled-in description that is the last section',
      body: '**What this PR does / why we need it**:\n\nKeeps the trailing slash.\n\n- [x] this PR contains unit tests',
      status: 'pass',
      evidence: [
        '60 characters under **What this PR does / why we need it**:',
        '1 of 1 checkboxes checked',
      ],
    },
    {
      name: 'warns when the description section is left empty under a summary line',
      body: `Adds a --no-summary flag.\n\n<!-- Thanks for sending a pull request! -->\n\n**What this PR does / why we need it**:\n\n**Special notes for your reviewer**:\n\n${IF_APPLICABLE_UNCHECKED}`,
      status: 'warn',
      evidence: [
        '#42 leaves **What this PR does / why we need it**: empty',
        '0 of 3 checkboxes checked',
      ],
    },
    {
      name: 'warns on a custom format without the description section',
      body: '## Summary\n\nOverride htpasswd to accept an algorithm.\n\n### Changes\n\n- New variadic htpasswd function',
      status: 'warn',
      evidence: [
        '#42 has no **What this PR does / why we need it**: section',
        '0 of 0 checkboxes checked',
      ],
    },
    {
      name: 'warns on an empty description',
      body: '  \n',
      status: 'warn',
      evidence: ['#42 has no description'],
    },
  ])('$name', ({ body, status, evidence }) => {
    const result = runCheck('template', makePrSnapshot({ body }));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual(evidence);
  });
});
