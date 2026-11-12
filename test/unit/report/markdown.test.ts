import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, onTestFinished, test } from 'vitest';

import type { AiOutcome, CheckStatus } from '../../../src/pr/types.ts';
import { READINESS_MARKER, renderMarkdown } from '../../../src/report/markdown.ts';
import { makeAiFlags, makeCheck, makeChecks, makeReport } from './factories.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const lintBinary = join(REPO_ROOT, 'node_modules/.bin/markdownlint-cli2');

/** The table rows (lines starting with a pipe) in a markdown document. */
function tableRows(markdown: string): string[] {
  return markdown.split('\n').filter((line) => line.startsWith('|'));
}

/** How many cells a table row has, counting only unescaped pipes as separators. */
function cellCount(row: string): number {
  return row.replace(/\\./g, '').split('|').length - 2;
}

describe('renderMarkdown', () => {
  test('starts with the exported marker on its own line', () => {
    const report = makeReport();

    const output = renderMarkdown(report);

    expect(READINESS_MARKER).toBe('<!-- helm-triage:readiness -->');
    expect(output.startsWith(`${READINESS_MARKER}\n`)).toBe(true);
  });

  test('links the pull request and names the short head SHA', () => {
    const report = makeReport();

    const output = renderMarkdown(report);

    expect(output).toContain(
      '| [helm/helm\u200B#32887: fix(lint): handle an empty values file](https://github.com/helm/helm/pull/32887) | `abcdef1` |',
    );
  });

  test.each<{ status: CheckStatus; expected: string }>([
    { status: 'pass', expected: '| CI | ✓ pass | ci looks good | ci evidence |' },
    { status: 'warn', expected: '| CI | ⚠ warn | ci looks good | ci evidence |' },
    { status: 'fail', expected: '| CI | ✗ fail | ci looks good | ci evidence |' },
    { status: 'info', expected: '| CI | ℹ info | ci looks good | ci evidence |' },
  ])('renders a $status check as a table row', ({ status, expected }) => {
    const report = makeReport({ checks: [makeCheck({ id: 'ci', title: 'CI', status })] });

    const output = renderMarkdown(report);

    expect(output).toContain(expected);
  });

  test('caps evidence with an "and N more" tail', () => {
    const evidence = ['one', 'two', 'three', 'four', 'five', 'six'];
    const report = makeReport({ checks: [makeCheck({ id: 'dco', status: 'fail', evidence })] });

    const output = renderMarkdown(report);

    expect(output).toContain('| one; two; three; four; five; and 1 more |');
  });

  test('shows every AI flag with its confidence and evidence under the advisory notice', () => {
    const report = makeReport();

    const output = renderMarkdown(report);

    expect(output).toContain(
      [
        '## Advisory (AI)',
        '',
        'AI flags are advisory; a maintainer decides. Model: `anthropic/claude-sonnet-5.5`.',
        '',
        '| Flag | Value | Confidence | Reason | Evidence |',
        '| --- | --- | --- | --- | --- |',
        '| kind | bug | high | fixes a nil dereference | pkg/lint/rules/values.go @@ -10,6 +10,8 @@ |',
        '| breaking change | possible | medium | changes a pkg/action flag default | pkg/action/install.go "Wait: true" |',
        '| needs HIP | no | high | a local fix | pkg/lint/rules/values.go @@ -10,6 +10,8 @@ |',
        '| summary | fixes nil deref in lint when values file is empty | — | — | pkg/lint/rules/values.go @@ -10,6 +10,8 @@ |',
        '| review focus | pkg/lint/rules/values.go | — | — | — |',
      ].join('\n'),
    );
  });

  test.each<{ ai: AiOutcome; expected: string }>([
    {
      ai: { status: 'skipped', reason: 'OPENROUTER_API_KEY is not set' },
      expected: '| skipped | OPENROUTER\\_API\\_KEY is not set |',
    },
    {
      ai: { status: 'failed', reason: 'the model returned invalid JSON' },
      expected: '| failed | the model returned invalid JSON |',
    },
  ])('says the AI was $ai.status with its reason and shows no flags', ({ ai, expected }) => {
    const report = makeReport({ ai });

    const output = renderMarkdown(report);

    expect(
      output.endsWith(`## Advisory (AI)\n\n| AI flags | Reason |\n| --- | --- |\n${expected}\n`),
    ).toBe(true);
    expect(output).not.toMatch(/advisory;|\| kind \||breaking change|needs HIP|review focus/);
  });

  test('keeps tables well-formed when the title and evidence hold pipes, backticks, and HTML', () => {
    const hostile =
      'a | b `code` <img src=x onerror=alert(1)> [x](javascript:y) & *bold* @helm/maintainers helm/helm#1\nnext';
    const report = makeReport({
      pr: { ...makeReport().pr, title: hostile },
      checks: [makeCheck({ id: 'dco', summary: hostile, evidence: [hostile, 'plain'] })],
      ai: {
        status: 'ok',
        model: 'm',
        flags: makeAiFlags({
          kind: {
            kind: 'bug',
            confidence: 'low',
            reason: hostile,
            evidence: [{ file: 'a|b.go', quote: hostile }],
          },
        }),
      },
    });

    const output = renderMarkdown(report);

    expect(tableRows(output).map(cellCount)).toEqual([2, 2, 2, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5]);
    expect(output).not.toMatch(/[^\\]<img/);
    expect(output).toContain(
      'a \\| b \\`code\\` \\<img src=x onerror=alert(1)\\> \\[x\\](javascript:y) \\& \\*bold\\* @\u200Bhelm/maintainers helm/helm\u200B#1 next',
    );
    expect(output).not.toMatch(/@helm|helm\/helm#/);
  });

  test('passes markdownlint with the repository config', async () => {
    const report = makeReport({
      checks: [...makeChecks('fail'), makeCheck({ id: 'size', evidence: ['x'.repeat(200)] })],
    });
    const directory = await mkdtemp(join(tmpdir(), 'readiness-'));
    onTestFinished(() => rm(directory, { recursive: true }));
    await copyFile(
      join(REPO_ROOT, '.markdownlint-cli2.jsonc'),
      join(directory, '.markdownlint-cli2.jsonc'),
    );
    await writeFile(join(directory, 'comment.md'), renderMarkdown(report));

    const lint = await promisify(execFile)(lintBinary, ['comment.md'], { cwd: directory }).then(
      () => 'clean',
      (error: { stderr: string }) => error.stderr,
    );

    expect(lint).toBe('clean');
  });
});
