/**
 * Produces the advisory AI flags for one pull request through OpenRouter's
 * OpenAI-compatible chat completions API, and caches them by head commit.
 * Without an API key the flags are skipped and nothing is sent.
 */

import type { Config } from '../config/load.ts';
import type { AiOutcome, PrSnapshot } from '../pr/types.ts';
import { readCachedAiFlags, writeCachedAiFlags } from './cache.ts';
import { buildPrompt } from './prompt.ts';
import { AI_FLAGS_SCHEMA, MalformedAnswerError, parseAiFlags } from './response.ts';

/** The configuration `getAiFlags` reads. Pass a whole `Config`. */
export type AiOptions = Pick<
  Config,
  'openRouterApiKey' | 'model' | 'openRouterUrl' | 'cacheDir' | 'diffTokenBudget'
>;

/** How long one completion may take before it counts as failed. */
const REQUEST_TIMEOUT_MS = 120_000;

/** How much of an error response body a failure reason quotes. */
const ERROR_BODY_PREVIEW_CHARS = 200;

/** The reason given when no API key is set. */
export const NO_API_KEY_REASON =
  'AI flags skipped because OPENROUTER_API_KEY is not set; set it to an OpenRouter API key to enable them';

/**
 * Returns the AI flags for `snapshot`: from the cache when the same model
 * already judged this head commit, otherwise from one OpenRouter request.
 * Never throws for a model or network problem; those become `failed`.
 */
export async function getAiFlags(snapshot: PrSnapshot, options: AiOptions): Promise<AiOutcome> {
  if (options.openRouterApiKey === undefined) {
    return { status: 'skipped', reason: NO_API_KEY_REASON };
  }

  const { repo, number, headSha } = snapshot;
  const cached = await readCachedAiFlags(options.cacheDir, repo, number, headSha);
  if (cached?.model === options.model) {
    return cached;
  }

  const outcome = await requestAiFlags(snapshot, options, options.openRouterApiKey);
  if (outcome.status === 'ok') {
    await writeCachedAiFlags(options.cacheDir, repo, number, headSha, outcome);
  }

  return outcome;
}

/** Sends one chat completion request and turns the answer into an outcome. */
async function requestAiFlags(
  snapshot: PrSnapshot,
  options: AiOptions,
  apiKey: string,
): Promise<AiOutcome> {
  const prompt = buildPrompt(snapshot, options.diffTokenBudget);
  const body = {
    model: options.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'helm_pr_flags', strict: true, schema: AI_FLAGS_SCHEMA },
    },
    // Route only to providers that honor the strict schema.
    provider: { require_parameters: true },
  };

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${options.openRouterUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    return { status: 'failed', reason: `OpenRouter request failed: ${describe(error)}` };
  }

  if (!response.ok) {
    const preview = text.slice(0, ERROR_BODY_PREVIEW_CHARS);

    return { status: 'failed', reason: `OpenRouter returned HTTP ${response.status}: ${preview}` };
  }

  try {
    const flags = parseAiFlags(readMessageContent(text), snapshot);

    return { status: 'ok', model: options.model, flags };
  } catch (error) {
    if (error instanceof MalformedAnswerError) {
      return { status: 'failed', reason: `the model gave an unusable answer: ${error.message}` };
    }
    throw error;
  }
}

/**
 * Pulls the first choice's message content out of a completion response.
 *
 * @throws {MalformedAnswerError} when the response has no string content.
 */
function readMessageContent(responseText: string): string {
  let completion: unknown;
  try {
    completion = JSON.parse(responseText);
  } catch {
    throw new MalformedAnswerError('the response is not valid JSON');
  }

  const content = (completion as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== 'string') {
    throw new MalformedAnswerError('the response has no message content');
  }

  return content;
}

/** A one-line description of a thrown value. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
