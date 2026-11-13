import { expect, test } from 'vitest';

import { createGithubClient, type Fetch } from '../../../src/github/client.ts';

const BASE_URL = 'https://api.example.test';

/**
 * A fake `fetch` that answers with `statuses` in order, the last one
 * repeating, and records how many requests it got.
 */
function scriptedFetch(statuses: number[]) {
  const requests: string[] = [];
  const fakeFetch: Fetch = async (input) => {
    requests.push(String(input));
    const status = statuses[Math.min(requests.length, statuses.length) - 1] ?? 200;
    const body = status === 200 ? '{"number":7}' : '{"message":"upstream connect error"}';

    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  };

  return { fakeFetch, requests };
}

/** A client on `fakeFetch` whose waits are recorded instead of slept. */
function clientWith(fakeFetch: Fetch) {
  const waits: number[] = [];
  const client = createGithubClient({
    baseUrl: BASE_URL,
    token: 'test-token',
    fetch: fakeFetch,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });

  return { client, waits };
}

test('a GET that hits a transient server error is retried until it succeeds', async () => {
  const { fakeFetch, requests } = scriptedFetch([503, 502, 200]);
  const { client, waits } = clientWith(fakeFetch);

  const body = await client.get<{ number: number }>('/repos/helm/helm/pulls/7');

  expect(body).toEqual({ number: 7 });
  expect(requests).toHaveLength(3);
  expect(waits).toEqual([1000, 3000]);
});

test('a server error that outlasts the retries fails, naming the request and status', async () => {
  const { fakeFetch, requests } = scriptedFetch([503]);
  const { client } = clientWith(fakeFetch);

  const failure = client.get('/repos/helm/helm/issues/32837/comments');

  await expect(failure).rejects.toThrow(
    /^GitHub GET \/repos\/helm\/helm\/issues\/32837\/comments failed \(503\)/,
  );
  expect(requests).toHaveLength(3);
});

test.each([404, 422, 501])(
  'a %i is not retried, since repeating it cannot help',
  async (status) => {
    const { fakeFetch, requests } = scriptedFetch([status]);
    const { client, waits } = clientWith(fakeFetch);

    const failure = client.get('/repos/helm/helm/pulls/7');

    await expect(failure).rejects.toThrow();
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  },
);
