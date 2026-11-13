/**
 * A small GitHub REST client on global `fetch`: authenticated GET requests,
 * pagination by `Link` header, retries of transient server errors, and errors
 * that name the failed request.
 */

import { setTimeout as delay } from 'node:timers/promises';

/** The `fetch` signature the client calls, so a recorder can wrap it. */
export type Fetch = typeof fetch;

/** Most items GitHub returns per page. */
const PER_PAGE = 100;

/** The `Accept` header GitHub recommends for its REST API. */
const ACCEPT = 'application/vnd.github+json';

/** The REST API version this client is written against. */
const API_VERSION = '2022-11-28';

/**
 * How long to wait before each retry of a server error. GitHub answers the
 * odd request with a 5xx under load, and a GET is safe to repeat, so a long
 * queue run survives one instead of losing the whole page.
 */
const SERVER_ERROR_RETRY_DELAYS_MS = [1000, 3000];

/** How to reach the API. */
export interface GithubClientOptions {
  /** Base URL with no trailing slash, such as `https://api.github.com`. */
  baseUrl: string;
  token: string;
  /** Defaults to global `fetch`. */
  fetch?: Fetch;
  /** Waits `milliseconds` before a retry; defaults to a real timer. */
  sleep?: (milliseconds: number) => Promise<void>;
}

/** A GitHub request failed. The message names the request and the reason. */
export class GithubApiError extends Error {
  override name = 'GithubApiError';

  /** The HTTP status GitHub answered with. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The client the snapshot fetcher reads through. */
export interface GithubClient {
  /**
   * GETs one resource at `path`, such as `/repos/helm/helm/pulls/1`.
   *
   * @throws {GithubApiError} on any unsuccessful response.
   */
  get<Body>(path: string): Promise<Body>;
  /**
   * GETs every page of a list at `path`. `itemsKey` names the array inside
   * an object body, as for check runs; omit it when the body is the array.
   *
   * @throws {GithubApiError} on any unsuccessful response.
   */
  getAll<Item>(path: string, itemsKey?: string): Promise<Item[]>;
}

/** Creates a client for the API at `options.baseUrl`. */
export function createGithubClient(options: GithubClientOptions): GithubClient {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  /**
   * GETs `url`, retrying server errors after each delay in
   * `SERVER_ERROR_RETRY_DELAYS_MS`, and fails loudly on anything else but a
   * success, or on a server error that outlasts the retries.
   */
  async function request(url: string): Promise<Response> {
    const get = () =>
      fetchImpl(url, {
        headers: {
          Accept: ACCEPT,
          Authorization: `Bearer ${options.token}`,
          'X-GitHub-Api-Version': API_VERSION,
        },
      });

    let response = await get();
    for (const retryDelay of SERVER_ERROR_RETRY_DELAYS_MS) {
      if (!isServerError(response)) {
        break;
      }
      await response.body?.cancel();
      await sleep(retryDelay);
      response = await get();
    }
    if (!response.ok) {
      throw await requestError(response, url.slice(options.baseUrl.length));
    }

    return response;
  }

  return {
    async get<Body>(path: string): Promise<Body> {
      const response = await request(`${options.baseUrl}${path}`);

      return (await response.json()) as Body;
    },

    async getAll<Item>(path: string, itemsKey?: string): Promise<Item[]> {
      const items: Item[] = [];
      let url: string | undefined = `${options.baseUrl}${withPerPage(path)}`;
      while (url !== undefined) {
        const response = await request(url);
        const body = (await response.json()) as unknown;
        items.push(...pageItems<Item>(body, itemsKey, url));
        url = nextPageUrl(response.headers.get('link'));
      }

      return items;
    },
  };
}

/** Whether GitHub answered with a 5xx, which may succeed on a retry. */
function isServerError(response: Response): boolean {
  return response.status >= 500 && response.status <= 599;
}

/** Waits `milliseconds` on a real timer. */
async function defaultSleep(milliseconds: number): Promise<void> {
  await delay(milliseconds);
}

/** Adds `per_page=100` to `path`'s query. */
function withPerPage(path: string): string {
  const separator = path.includes('?') ? '&' : '?';

  return `${path}${separator}per_page=${PER_PAGE}`;
}

/**
 * The items of one page: the body itself, or the array under `itemsKey`.
 *
 * @throws {GithubApiError} when the body has no such array.
 */
function pageItems<Item>(body: unknown, itemsKey: string | undefined, url: string): Item[] {
  const items =
    itemsKey === undefined ? body : (body as Record<string, unknown> | null)?.[itemsKey];
  if (!Array.isArray(items)) {
    const expected = itemsKey === undefined ? 'an array' : `an array under "${itemsKey}"`;
    throw new GithubApiError(`GitHub GET ${url} returned no list; expected ${expected}`, 200);
  }

  return items as Item[];
}

/** The `rel="next"` URL from a `Link` header, if there is one. */
export function nextPageUrl(linkHeader: string | null): string | undefined {
  if (linkHeader === null) {
    return undefined;
  }

  return /<([^>]+)>;\s*rel="next"/.exec(linkHeader)?.[1];
}

/** Builds the error for an unsuccessful response to `path`. */
async function requestError(response: Response, path: string): Promise<GithubApiError> {
  const request = `GitHub GET ${path}`;
  const detail = await responseMessage(response);

  if (response.status === 401) {
    return new GithubApiError(
      `${request} was rejected (401): check that GITHUB_TOKEN is a valid token`,
      401,
    );
  }

  if (isRateLimited(response, detail)) {
    const reset = response.headers.get('x-ratelimit-reset');
    const when =
      reset === null ? '' : `; it resets at ${new Date(Number(reset) * 1000).toISOString()}`;

    return new GithubApiError(`${request} hit the GitHub rate limit${when}`, response.status);
  }

  if (response.status === 404) {
    return new GithubApiError(
      `${request} was not found (404): check the repository and number, and that the token can read it`,
      404,
    );
  }

  return new GithubApiError(`${request} failed (${response.status}): ${detail}`, response.status);
}

/** Whether a 403 or 429 is GitHub's primary or secondary rate limit. */
function isRateLimited(response: Response, detail: string): boolean {
  if (response.status === 429) {
    return true;
  }

  return (
    response.status === 403 &&
    (response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail))
  );
}

/** GitHub's `message` field from an error body, else the raw text. */
async function responseMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: unknown };

    return typeof parsed.message === 'string' ? parsed.message : text;
  } catch {
    return text;
  }
}
