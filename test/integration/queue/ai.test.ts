import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { writeCachedAiFlags } from '../../../src/ai/cache.ts';
import { parseAiFlags } from '../../../src/ai/response.ts';
import { type Environment, loadConfig } from '../../../src/config/load.ts';
import type { PrSnapshot } from '../../../src/pr/types.ts';
import { aiFooterLines, fillAiFlags } from '../../../src/queue/ai-columns.ts';
import { buildQueue, groupIntoSections, toEntry } from '../../../src/queue/build.ts';
import { runQueueCommand } from '../../../src/queue/command.ts';
import { validAnswer } from '../../support/ai-answer.ts';
import { type GithubReplay, startGithubReplay } from '../../support/github-replay.ts';
import {
  completionReply,
  type OpenRouterFake,
  startOpenRouterFake,
} from '../../support/openrouter-fake.ts';
import { makePrSnapshot } from '../../support/pr-snapshot.ts';
import { FORK_REPO, recordedFork } from './recorded-fork.ts';

const MODEL = 'anthropic/claude-sonnet-5.5';
const NOW = new Date();

let fake: OpenRouterFake;
let replay: GithubReplay | undefined;
let cacheDir: string;

beforeEach(async () => {
  fake = await startOpenRouterFake();
  cacheDir = await mkdtemp(join(tmpdir(), 'helm-triage-queue-ai-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await replay?.close();
  replay = undefined;
  await fake.close();
  await rm(cacheDir, { recursive: true, force: true });
});

/** Environment pointing at the fakes and the temporary cache, with a key unless told otherwise. */
function environment({ withKey = true } = {}): Environment {
  return {
    GITHUB_TOKEN: 'test-token',
    HELM_TRIAGE_GITHUB_API_URL: replay?.url ?? 'http://127.0.0.1:9',
    HELM_TRIAGE_OPENROUTER_URL: fake.url,
    HELM_TRIAGE_CACHE_DIR: cacheDir,
    HELM_TRIAGE_MODEL: MODEL,
    ...(withKey ? { OPENROUTER_API_KEY: 'sk-or-test' } : {}),
  };
}

/** Runs `queue` against the recorded fork and resolves to what it printed. */
async function runForkQueue(args: string[], env: Environment): Promise<string> {
  await replay?.close();
  replay = await startGithubReplay(recordedFork());
  let printed = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    printed += String(chunk);
    return true;
  });

  await runQueueCommand(['--repo', FORK_REPO, ...args], {
    ...env,
    HELM_TRIAGE_GITHUB_API_URL: replay.url,
  });
  vi.restoreAllMocks();

  return printed;
}

/** Caches the valid answer's flags for `snapshot`'s head commit. */
async function cacheFlagsFor(snapshot: PrSnapshot): Promise<void> {
  const flags = parseAiFlags(JSON.stringify(validAnswer()), makePrSnapshot());
  await writeCachedAiFlags(cacheDir, snapshot.repo, snapshot.number, snapshot.headSha, {
    status: 'ok',
    model: MODEL,
    flags,
  });
}

/** A queue of synthetic pull requests numbered `numbers`, all citing the default snapshot's files. */
function syntheticSections(numbers: number[]) {
  return groupIntoSections(numbers.map((number) => toEntry(makePrSnapshot({ number }), NOW)));
}

test('queue --ai shows the cached flags and makes no AI request', async () => {
  replay = await startGithubReplay(recordedFork());
  const sections = await buildQueue(loadConfig(environment()), {
    repo: FORK_REPO,
    now: NOW,
    sleep: async () => {},
  });
  for (const entry of sections.flatMap((section) => section.entries)) {
    await cacheFlagsFor(entry.snapshot);
  }

  const printed = await runForkQueue(['--ai', '--format', 'md'], environment());

  expect(printed).toMatch(/^\| PR \| Title .* \| Reason \| Kind \| Breaking \| Needs HIP \|$/m);
  expect(printed).toMatch(/^\| #1 \|.* \| bug \(high\) \| no \| no \|$/m);
  expect(printed).not.toContain('AI flags failed');
  expect(fake.requests).toHaveLength(0);
});

test('a cache miss with a key asks once per PR, and a second run asks none', async () => {
  fake.reply(completionReply(validAnswer()), completionReply(validAnswer()));
  const config = loadConfig(environment());

  await fillAiFlags(syntheticSections([1, 2]), config);
  const second = syntheticSections([1, 2]);
  await fillAiFlags(second, config);

  expect(fake.requests).toHaveLength(2);
  expect(second.flatMap((section) => section.entries).map((entry) => entry.ai?.status)).toEqual([
    'ok',
    'ok',
  ]);
});

test('a cache miss without a key prints dashes and one notice, and makes no request', async () => {
  const printed = await runForkQueue(['--ai', '--limit', '2'], environment({ withKey: false }));

  expect(printed).toMatch(/^ {2}#1 .* {2}- {2}- {2}-$/m);
  expect(printed).toMatch(
    /\n\n2 pull requests had no cached AI data and OPENROUTER_API_KEY is not set\n$/,
  );
  expect(fake.requests).toHaveLength(0);
});

test('one failed AI call leaves the other rows intact and is counted in the footer', async () => {
  fake.reply(completionReply(validAnswer()), { status: 500, body: 'upstream down' });
  const sections = syntheticSections([1, 2]);

  const summary = await fillAiFlags(sections, loadConfig(environment()));

  const statuses = sections.flatMap((section) => section.entries).map((entry) => entry.ai?.status);
  expect(statuses.sort()).toEqual(['failed', 'ok']);
  expect(aiFooterLines(summary)).toEqual(['AI flags failed for 1 pull request']);
});

test('the bucket order is the same with and without --ai', async () => {
  const without = await runForkQueue([], environment({ withKey: false }));
  const withAi = await runForkQueue(['--ai'], environment({ withKey: false }));

  const prOrder = (printed: string) =>
    [...printed.matchAll(/^(\S.*\(\d+\)| {2}#\d+)/gm)].map((match) => match[1]);
  expect(prOrder(withAi)).toEqual(prOrder(without));
  expect(prOrder(without).length).toBeGreaterThan(6);
});
