import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { Recording } from '../../src/github/recording.ts';
import { READINESS_MARKER } from '../../src/report/markdown.ts';
import { validAnswer } from '../support/ai-answer.ts';
import { type GithubReplay, loadRecording, startGithubReplay } from '../support/github-replay.ts';
import {
  completionReply,
  type OpenRouterFake,
  startOpenRouterFake,
} from '../support/openrouter-fake.ts';

const ENTRY_POINT = new URL('../../src/index.ts', import.meta.url).pathname;

/** The answer key fields these tests assert against; `null` means not asserted. */
interface Manifest {
  repo: string;
  prs: {
    id: string;
    pr_number: number;
    expected: {
      dco_ok: boolean | null;
      conflict: boolean | null;
      ci: 'passing' | 'failing' | null;
      linked_issue: number | null;
      duplicate_of: number | null;
      template_untouched: boolean | null;
      tests_touched: boolean | null;
    };
  }[];
}

const MANIFEST = JSON.parse(
  readFileSync(new URL('../fixtures/synthetic-prs.json', import.meta.url), 'utf8'),
) as Manifest;

/** A check status as the markdown report prints it. */
type Status = 'pass' | 'warn' | 'fail' | 'info';

/** What a finished run of the CLI printed and exited with. */
interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let replay: GithubReplay | undefined;
let openRouter: OpenRouterFake;
let cacheDir: string;

beforeEach(async () => {
  openRouter = await startOpenRouterFake();
  cacheDir = mkdtempSync(join(tmpdir(), 'helm-triage-e2e-'));
});

afterEach(async () => {
  await replay?.close();
  replay = undefined;
  await openRouter.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

/**
 * Runs the real entry point with `args` against the replayed GitHub API and
 * the OpenRouter fake. The child runs asynchronously so this process's fake
 * servers can answer it.
 */
function runCli(args: string[], extraEnv: Record<string, string> = {}): Promise<CliRun> {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: MANIFEST.repo,
    HELM_TRIAGE_GITHUB_API_URL: replay?.url,
    HELM_TRIAGE_OPENROUTER_URL: openRouter.url,
    HELM_TRIAGE_CACHE_DIR: cacheDir,
    ...extraEnv,
  };
  const child = spawn(process.execPath, [ENTRY_POINT, ...args], { env });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      if (exitCode === null) {
        reject(new Error(`helm-triage ${args.join(' ')} was killed by ${signal}`));

        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

/** Each check's status from a markdown report's checks table, by check title. */
function statusesByTitle(markdown: string): Record<string, Status> {
  const statuses: Record<string, Status> = {};
  for (const match of markdown.matchAll(/^\| ([^|]+) \| \S+ (pass|warn|fail|info) \|/gm)) {
    const [, title = '', status] = match;
    statuses[title] = status as Status;
  }

  return statuses;
}

/** The statuses the answer key allows for each check it asserts, by check title. */
function allowedStatuses(expected: Manifest['prs'][number]['expected']): Record<string, Status[]> {
  const allowed: Record<string, Status[]> = {};
  if (expected.dco_ok !== null) {
    allowed.DCO = expected.dco_ok ? ['pass'] : ['fail'];
  }
  if (expected.conflict !== null) {
    allowed.Conflicts = expected.conflict ? ['fail'] : ['pass'];
  }
  if (expected.ci !== null) {
    allowed.CI = expected.ci === 'failing' ? ['fail'] : ['pass'];
  }
  if (expected.linked_issue !== null) {
    allowed['Linked issue'] = ['pass'];
  }
  if (expected.duplicate_of !== null) {
    allowed.Duplicates = ['warn'];
  }
  if (expected.template_untouched !== null) {
    allowed.Template = expected.template_untouched ? ['warn'] : ['pass'];
  }
  if (expected.tests_touched !== null) {
    allowed.Tests = expected.tests_touched ? ['pass'] : ['warn', 'info'];
  }

  return allowed;
}

/** A valid model answer whose every evidence item cites `path`, so the flags stay grounded. */
function answerCiting(path: string) {
  const answer = validAnswer();
  for (const flag of [answer.kind, answer.breakingChange, answer.needsHip, answer.summary]) {
    flag.evidence = [{ file: path, hunk: null, quote: 'func' }];
  }

  return answer;
}

/** The path of the first file `recording` lists as changed by pull request `number`. */
function firstChangedFile(recording: Recording, number: number): string {
  const key = `GET /repos/${MANIFEST.repo}/pulls/${number}/files?per_page=100`;
  const files = recording[key]?.at(-1)?.body as { filename: string }[] | undefined;
  const [first] = files ?? [];
  if (first === undefined) {
    throw new Error(`the recording has no changed files for #${number}`);
  }

  return first.filename;
}

describe('helm-triage pr', () => {
  test.for(MANIFEST.prs)('$id (#$pr_number) matches the answer key', async (pr) => {
    const recording = loadRecording(`pr-${pr.pr_number}.json`);
    replay = await startGithubReplay(recording);
    openRouter.reply(completionReply(answerCiting(firstChangedFile(recording, pr.pr_number))));

    const run = await runCli(['pr', String(pr.pr_number), '--format', 'md'], {
      OPENROUTER_API_KEY: 'test-key',
    });

    expect(run.stderr).toBe('');
    expect(run.exitCode).toBe(0);
    const statuses = statusesByTitle(run.stdout);
    for (const [title, allowed] of Object.entries(allowedStatuses(pr.expected))) {
      expect(allowed, `${title} is ${statuses[title]}`).toContain(statuses[title]);
    }
    expect(run.stdout).toContain('Treats an empty values file as valid instead of crashing.');
    expect(openRouter.requests).toHaveLength(1);
  });

  test('prints a markdown report that starts with the readiness marker', async () => {
    replay = await startGithubReplay(loadRecording('pr-14.json'));

    const run = await runCli(['pr', '14', '--repo', MANIFEST.repo, '--format', 'md']);

    expect(run.exitCode).toBe(0);
    expect(run.stdout.startsWith(`${READINESS_MARKER}\n`)).toBe(true);
    expect(run.stdout).toContain('| DCO | ❌ fail |');
  });

  test('prints a text report by default', async () => {
    replay = await startGithubReplay(loadRecording('pr-14.json'));

    const run = await runCli(['pr', '14']);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^theycallmeswift\/helm#14 urlutil: keep trailing slash/);
    expect(run.stdout).toContain('DCO ❌');
    expect(run.stdout).not.toContain(READINESS_MARKER);
  });

  test('says AI was skipped and sends nothing when OPENROUTER_API_KEY is unset', async () => {
    replay = await startGithubReplay(loadRecording('pr-13.json'));

    const run = await runCli(['pr', '13']);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('AI flags skipped: AI flags skipped because OPENROUTER_API_KEY');
    expect(openRouter.requests).toHaveLength(0);
  });

  test('still prints the checks and exits 0 when the AI request fails', async () => {
    replay = await startGithubReplay(loadRecording('pr-13.json'));
    openRouter.reply({ status: 500, body: 'upstream down' });

    const run = await runCli(['pr', '13'], { OPENROUTER_API_KEY: 'test-key' });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('DCO ✅');
    expect(run.stdout).toContain('AI flags failed:');
  });

  test('fails with one line for a pull request GitHub does not have', async () => {
    replay = await startGithubReplay(loadRecording('pr-13.json'));

    const run = await runCli(['pr', '999']);

    expect(run.exitCode).not.toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^helm-triage: GitHub GET .*\/pulls\/999 failed.*\n$/);
  });

  test.each([
    { args: ['pr', 'abc'], message: 'must be a positive whole number, got "abc"' },
    { args: ['pr'], message: 'pr takes exactly one pull request number' },
    { args: ['pr', '13', '--format', 'html'], message: '--format must be one of text, md' },
  ])('rejects $args with one line', async ({ args, message }) => {
    const run = await runCli(args);

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain(message);
    expect(run.stderr.trimEnd().split('\n')).toHaveLength(1);
  });
});
