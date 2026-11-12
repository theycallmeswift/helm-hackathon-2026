import { describe, expect, test } from 'vitest';

import type { AiOutcome, CheckStatus } from '../../../src/pr/types.ts';
import { renderText } from '../../../src/report/text.ts';
import { makeCheck, makeChecks, makeReport } from './factories.ts';

describe('renderText', () => {
  test('starts with the repo, number, title, and short head SHA', () => {
    const report = makeReport();

    const output = renderText(report);

    expect(output.split('\n')[0]).toBe(
      'helm/helm#32887 fix(lint): handle an empty values file (abcdef1)',
    );
  });

  test('puts one mark per check on a single line, in report order', () => {
    const report = makeReport({
      checks: [
        makeCheck({ id: 'dco', title: 'DCO', status: 'pass' }),
        makeCheck({ id: 'conflicts', title: 'conflicts', status: 'fail' }),
        makeCheck({ id: 'ci', title: 'CI', status: 'warn' }),
        makeCheck({ id: 'size', title: 'size', status: 'info' }),
      ],
    });

    const output = renderText(report);

    expect(output.split('\n')[1]).toBe('  DCO ✓  conflicts ✗  CI ⚠  size ℹ');
  });

  test.each<{ status: CheckStatus; listsEvidence: boolean }>([
    { status: 'pass', listsEvidence: false },
    { status: 'info', listsEvidence: false },
    { status: 'warn', listsEvidence: true },
    { status: 'fail', listsEvidence: true },
  ])('a $status check lists its evidence: $listsEvidence', ({ status, listsEvidence }) => {
    const report = makeReport({
      checks: [
        makeCheck({
          id: 'ci',
          title: 'CI',
          status,
          summary: 'lint is red',
          evidence: ['lint: failure'],
        }),
      ],
    });

    const output = renderText(report);

    expect(output.includes('    - lint: failure')).toBe(listsEvidence);
    expect(output.includes(`CI: lint is red`)).toBe(listsEvidence);
  });

  test('caps evidence with an "and N more" tail', () => {
    const evidence = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    const report = makeReport({ checks: [makeCheck({ id: 'dco', status: 'fail', evidence })] });

    const output = renderText(report);

    expect(output).toContain('    - five\n    - and 2 more\n');
    expect(output).not.toContain('six');
  });

  test('shows every AI flag under the advisory notice when the AI ran', () => {
    const report = makeReport({ checks: makeChecks() });

    const output = renderText(report);

    expect(output).toContain(
      [
        '  🤖 AI flags are advisory; a maintainer decides. Model: anthropic/claude-sonnet-5.5.',
        '  🤖 kind: bug (high) — fixes a nil dereference',
        '      pkg/lint/rules/values.go @@ -10,6 +10,8 @@',
        '  🤖 breaking change: possible (medium) — changes a pkg/action flag default',
        '      pkg/action/install.go "Wait: true"',
        '  🤖 needs HIP: no (high) — a local fix',
        '      pkg/lint/rules/values.go @@ -10,6 +10,8 @@',
        '  🤖 summary: fixes nil deref in lint when values file is empty',
        '      pkg/lint/rules/values.go @@ -10,6 +10,8 @@',
        '  🤖 review focus: pkg/lint/rules/values.go',
      ].join('\n'),
    );
  });

  test.each<{ ai: AiOutcome; expected: string }>([
    {
      ai: { status: 'skipped', reason: 'OPENROUTER_API_KEY is not set' },
      expected: '  🤖 AI flags skipped: OPENROUTER_API_KEY is not set\n',
    },
    {
      ai: { status: 'failed', reason: 'the model returned invalid JSON' },
      expected: '  🤖 AI flags failed: the model returned invalid JSON\n',
    },
  ])('says the AI was $ai.status in one line and shows no flags', ({ ai, expected }) => {
    const report = makeReport({ ai });

    const output = renderText(report);

    expect(output.endsWith(`(abcdef1)\n${output.split('\n')[1]}\n${expected}`)).toBe(true);
    expect(output).not.toMatch(/advisory|kind:|breaking change|needs HIP|summary:|review focus/);
  });

  test('keeps a multi-line title on the header line', () => {
    const report = makeReport({ pr: { ...makeReport().pr, title: 'first\nsecond' } });

    const output = renderText(report);

    expect(output.split('\n')[0]).toBe('helm/helm#32887 first second (abcdef1)');
  });

  test('strips control characters from untrusted text', () => {
    const report = makeReport({
      pr: { ...makeReport().pr, title: 'red \u001b[31mtitle\u0007\u007f' },
      checks: [makeCheck({ id: 'dco', status: 'fail', evidence: ['clear \u001b[2J screen'] })],
    });

    const output = renderText(report);

    expect(output).toContain('helm/helm#32887 red [31mtitle (abcdef1)');
    expect(output).toContain('    - clear [2J screen');
    expect(output.replaceAll('\n', '')).not.toMatch(/\p{Cc}/u);
  });

  test('uses no ANSI escape codes', () => {
    const report = makeReport({ checks: makeChecks('fail') });

    const output = renderText(report);

    expect(output).not.toContain('\u001b[');
  });
});
