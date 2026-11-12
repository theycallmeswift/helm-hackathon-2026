import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readCachedAiFlags } from '../../../src/ai/cache.ts';
import { type AiOptions, getAiFlags, NO_API_KEY_REASON } from '../../../src/ai/flags.ts';
import { AI_FLAGS_SCHEMA } from '../../../src/ai/response.ts';
import { validAnswer } from '../../support/ai-answer.ts';
import {
  completionReply,
  type OpenRouterFake,
  startOpenRouterFake,
} from '../../support/openrouter-fake.ts';
import { makeFile, makePrSnapshot } from '../../support/pr-snapshot.ts';

const MODEL = 'anthropic/claude-sonnet-5.5';
const OTHER_HEAD_SHA = '2222222222222222222222222222222222222222';

let fake: OpenRouterFake;
let cacheDir: string;

beforeEach(async () => {
  fake = await startOpenRouterFake();
  cacheDir = await mkdtemp(join(tmpdir(), 'helm-triage-ai-'));
});

afterEach(async () => {
  await fake.close();
  await rm(cacheDir, { recursive: true, force: true });
});

/** Options pointing at the fake, with a key set unless overridden. */
function options(overrides: Partial<AiOptions> = {}): AiOptions {
  return {
    openRouterApiKey: 'sk-or-test',
    model: MODEL,
    openRouterUrl: fake.url,
    cacheDir,
    diffTokenBudget: 24_000,
    ...overrides,
  };
}

/** Options pointing at the fake, with no API key. */
function optionsWithoutKey(): AiOptions {
  const { openRouterApiKey: _, ...withoutKey } = options();

  return withoutKey;
}

describe('getAiFlags', () => {
  test('sends the model, strict schema, and truncated patches, and returns ok flags with evidence', async () => {
    fake.reply(completionReply(validAnswer()));
    const snapshot = makePrSnapshot({
      files: [
        makeFile({ patch: `@@ -10,6 +10,8 @@\n${'+x\n'.repeat(20)}` }),
        makeFile({ path: 'pkg/lint/rules/values_test.go', patch: '@@ -1 +1 @@\n+test' }),
      ],
    });

    const outcome = await getAiFlags(snapshot, options({ diffTokenBudget: 5 }));

    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request?.path).toBe('/api/v1/chat/completions');
    expect(request?.authorization).toBe('Bearer sk-or-test');
    expect(request?.body).toMatchObject({
      model: MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true, schema: AI_FLAGS_SCHEMA },
      },
      provider: { require_parameters: true },
    });
    // No endpoint for the default model accepts temperature, so with
    // require_parameters it would leave OpenRouter no provider to route to.
    expect(request?.body).not.toHaveProperty('temperature');
    const body = request?.body as { messages: { content: string }[] } | undefined;
    const userMessage = body?.messages[1]?.content;
    expect(userMessage).toContain('[patch truncated]');
    expect(userMessage).toContain('### pkg/lint/rules/values_test.go');
    expect(userMessage).toContain('[patch omitted: over budget]');
    expect(outcome).toMatchObject({
      status: 'ok',
      model: MODEL,
      flags: {
        kind: {
          kind: 'bug',
          evidence: [{ file: 'pkg/lint/rules/values.go', hunk: '@@ -10,6 +10,8 @@' }],
        },
      },
    });
  });

  test('skips without a request when OPENROUTER_API_KEY is not set', async () => {
    const outcome = await getAiFlags(makePrSnapshot(), optionsWithoutKey());

    expect(outcome).toEqual({ status: 'skipped', reason: NO_API_KEY_REASON });
    expect(NO_API_KEY_REASON).toContain('OPENROUTER_API_KEY is not set');
    expect(fake.requests).toHaveLength(0);
  });

  test('fails with a reason when the answer is malformed, and does not cache it', async () => {
    fake.reply({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: '{"kind":' } }] }),
    });
    const snapshot = makePrSnapshot();

    const outcome = await getAiFlags(snapshot, options());

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'the model gave an unusable answer: the model answer is not valid JSON',
    });
    expect(
      await readCachedAiFlags(cacheDir, snapshot.repo, snapshot.number, snapshot.headSha),
    ).toBeUndefined();
  });

  test('fails with the status when OpenRouter returns an HTTP error', async () => {
    fake.reply({ status: 429, body: '{"error":{"message":"rate limited"}}' });

    const outcome = await getAiFlags(makePrSnapshot(), options());

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'OpenRouter returned HTTP 429: {"error":{"message":"rate limited"}}',
    });
  });

  test('fails instead of throwing when the connection drops after the headers', async () => {
    fake.reply({ status: 200, body: '{"choices":[]}', dropAfterHeaders: true });

    const outcome = await getAiFlags(makePrSnapshot(), options());

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(outcome.status === 'failed' && outcome.reason).toMatch(/^OpenRouter request failed: /);
  });

  test('treats a corrupt cache file as a miss and asks again', async () => {
    fake.reply(completionReply(validAnswer()));
    const snapshot = makePrSnapshot();
    const path = join(cacheDir, 'ai-flags', 'helm', 'helm', '42', `${snapshot.headSha}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '{"model":');

    const outcome = await getAiFlags(snapshot, options());

    expect(outcome).toMatchObject({ status: 'ok', model: MODEL });
    expect(fake.requests).toHaveLength(1);
  });

  test('fails when a flag cites only a file outside the pull request', async () => {
    const answer = validAnswer();
    answer.breakingChange.evidence = [
      { file: 'pkg/action/install.go', hunk: '@@ -1 +1 @@', quote: null },
    ];
    fake.reply(completionReply(answer));

    const outcome = await getAiFlags(makePrSnapshot(), options());

    expect(outcome).toEqual({
      status: 'failed',
      reason:
        'the model gave an unusable answer: the breakingChange flag cites no file the pull request changes, so it has no evidence',
    });
  });

  test('answers a repeat for the same head SHA from the cache without a request', async () => {
    fake.reply(completionReply(validAnswer()));
    const snapshot = makePrSnapshot();
    const first = await getAiFlags(snapshot, options());

    const repeat = await getAiFlags(snapshot, options());

    expect(repeat).toEqual(first);
    expect(fake.requests).toHaveLength(1);
    expect(
      await readCachedAiFlags(cacheDir, snapshot.repo, snapshot.number, snapshot.headSha),
    ).toEqual(first);
  });

  test('asks again when the head SHA changes', async () => {
    fake.reply(completionReply(validAnswer()), completionReply(validAnswer()));
    await getAiFlags(makePrSnapshot(), options());

    await getAiFlags(makePrSnapshot({ headSha: OTHER_HEAD_SHA }), options());

    expect(fake.requests).toHaveLength(2);
  });

  test('asks again when the model changes', async () => {
    fake.reply(completionReply(validAnswer()), completionReply(validAnswer()));
    await getAiFlags(makePrSnapshot(), options());

    const outcome = await getAiFlags(makePrSnapshot(), options({ model: 'other/model' }));

    expect(fake.requests).toHaveLength(2);
    expect(outcome).toMatchObject({ status: 'ok', model: 'other/model' });
  });
});
