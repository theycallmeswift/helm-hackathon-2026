import { afterEach, expect, test } from 'vitest';

import { loadConfig } from '../../../src/config/load.ts';
import { REDACTED, type Recording, recordingFetch } from '../../../src/github/recording.ts';
import { fetchPrSnapshot } from '../../../src/github/snapshot.ts';
import { type GithubReplay, startGithubReplay } from '../../support/github-replay.ts';

const TOKEN = 'ghp_ThisIsTheCallersOwnToken000000000000';
const OTHER_TOKEN = 'github_pat_SomeoneElsesTokenInABody00000';
const PULL_PATH = '/repos/octo/helm/pulls/7';

let replay: GithubReplay | undefined;

afterEach(async () => {
  await replay?.close();
  replay = undefined;
});

/** The smallest recording a snapshot can be fetched from, with secrets in a body and a header. */
function leakyRecording(): Recording {
  const empty = [{ status: 200, headers: {}, body: [] }];

  return {
    [`GET ${PULL_PATH}`]: [
      {
        status: 200,
        headers: {},
        body: {
          number: 7,
          title: 'chore: rotate keys',
          body: `old token ${TOKEN} and ${OTHER_TOKEN}`,
          html_url: 'https://github.com/octo/helm/pull/7',
          user: { login: 'ada', type: 'User' },
          author_association: 'OWNER',
          created_at: '2026-11-01T00:00:00Z',
          base: { ref: 'main' },
          head: { sha: 'abc' },
          labels: [],
          mergeable: true,
          mergeable_state: 'clean',
        },
      },
    ],
    [`GET ${PULL_PATH}/commits?per_page=100`]: [
      {
        status: 200,
        headers: { link: `<${PULL_PATH}/commits?page=2&token=${TOKEN}>; rel="last"` },
        body: [],
      },
    ],
    [`GET ${PULL_PATH}/files?per_page=100`]: empty,
    [`GET ${PULL_PATH}/reviews?per_page=100`]: empty,
    'GET /repos/octo/helm/issues/7/comments?per_page=100': empty,
    [`GET ${PULL_PATH}/comments?per_page=100`]: empty,
    'GET /repos/octo/helm/commits/abc/check-runs?per_page=100': [
      { status: 200, headers: {}, body: { check_runs: [] } },
    ],
    'GET /repos/octo/helm/commits/abc/status?per_page=100': [
      { status: 200, headers: {}, body: { statuses: [] } },
    ],
  };
}

test('the recorder keeps every request the fetcher makes, with tokens removed', async () => {
  replay = await startGithubReplay(leakyRecording());
  const config = loadConfig({ GITHUB_TOKEN: TOKEN, HELM_TRIAGE_GITHUB_API_URL: replay.url });
  const recording: Recording = {};
  const fetch = recordingFetch({
    inner: globalThis.fetch,
    baseUrl: replay.url,
    token: TOKEN,
    recording,
  });

  await fetchPrSnapshot(config, 'octo/helm', 7, { fetch });

  const recorded = JSON.stringify(recording);
  expect(Object.keys(recording).sort()).toEqual(Object.keys(leakyRecording()).sort());
  expect(recorded).not.toContain(TOKEN);
  expect(recorded).not.toContain(OTHER_TOKEN);
  expect(recorded).toContain(REDACTED);
  expect(recorded).not.toContain(replay.url);
});
