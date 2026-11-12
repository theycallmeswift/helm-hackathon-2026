import { describe, expect, test } from 'vitest';

import type { CheckStatus } from '../../../src/pr/types.ts';
import { makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('template check', () => {
  test.each<{ name: string; body: string; status: CheckStatus; evidence: string[] }>([
    {
      name: 'passes when some checkboxes are checked',
      body: 'Fixes it.\n\n- [x] this PR has tests\n- [ ] this PR changes docs',
      status: 'pass',
      evidence: ['1 of 2 checkboxes checked'],
    },
    {
      name: 'counts an uppercase X as checked',
      body: '* [X] this PR has tests',
      status: 'pass',
      evidence: ['1 of 1 checkboxes checked'],
    },
    {
      name: 'passes a description without checkboxes',
      body: 'Handles an empty values file.',
      status: 'pass',
      evidence: ['0 checkboxes in a 29-character description'],
    },
    {
      name: 'warns when no checkbox is checked',
      body: '- [ ] this PR has tests\n- [ ] this PR has been signed off',
      status: 'warn',
      evidence: ['0 of 2 checkboxes checked'],
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
