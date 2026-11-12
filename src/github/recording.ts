/**
 * Recorded GitHub responses, so tests replay the exact requests the client
 * makes without the network. The recorder wraps `fetch`; the replay server
 * in the tests serves what it captured.
 */

import type { Fetch } from './client.ts';

/** One recorded response. */
export interface RecordedResponse {
  status: number;
  /** Only headers the client reads; `link` URLs are relative to the API base. */
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Responses keyed by `GET <path and query relative to the API base>`. A key
 * holds a list so a replay can answer the same request differently each
 * time, as GitHub does while it computes mergeability; the last entry
 * repeats.
 */
export type Recording = Record<string, RecordedResponse[]>;

/** Response headers worth keeping; everything else may carry request metadata. */
const KEPT_HEADERS = ['link', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

/** Shapes of GitHub tokens, so one never lands in a fixture even if a body echoes it. */
const TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

/** What replaces a removed secret. */
export const REDACTED = '[redacted]';

/** The recording key for a request to `url` against an API at `baseUrl`. */
export function recordingKey(url: string, baseUrl: string): string {
  return `GET ${url.slice(baseUrl.length)}`;
}

/**
 * Wraps `inner` so every response it returns is also added to `recording`,
 * with secrets removed. `token` is removed wherever it appears, as are
 * GitHub token shapes.
 */
export function recordingFetch(options: {
  inner: Fetch;
  baseUrl: string;
  token: string;
  recording: Recording;
}): Fetch {
  const { inner, baseUrl, token, recording } = options;

  return async (input, init) => {
    const response = await inner(input, init);
    const url = input instanceof Request ? input.url : String(input);
    const text = await response.clone().text();
    const recorded = redactResponse(
      {
        status: response.status,
        headers: keptHeaders(response.headers, baseUrl),
        body: text === '' ? null : (JSON.parse(text) as unknown),
      },
      token,
    );
    const key = recordingKey(url, baseUrl);
    recording[key] = [...(recording[key] ?? []), recorded];

    return response;
  };
}

/** The headers worth keeping, with `link` URLs made relative to `baseUrl`. */
function keptHeaders(headers: Headers, baseUrl: string): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = headers.get(name);
    if (value !== null) {
      kept[name] = name === 'link' ? value.replaceAll(`<${baseUrl}`, '<') : value;
    }
  }

  return kept;
}

/** Returns `response` with `token` and anything token-shaped replaced by `REDACTED`. */
export function redactResponse(response: RecordedResponse, token: string): RecordedResponse {
  const redact = (text: string): string =>
    (token === '' ? text : text.replaceAll(token, REDACTED)).replace(TOKEN_PATTERN, REDACTED);

  return JSON.parse(redact(JSON.stringify(response))) as RecordedResponse;
}
