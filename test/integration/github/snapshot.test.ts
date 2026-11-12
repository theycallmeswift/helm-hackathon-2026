import { afterEach, describe, expect, test } from 'vitest';

import { loadConfig } from '../../../src/config/load.ts';
import type { RecordedResponse, Recording } from '../../../src/github/recording.ts';
import {
  fetchPrSnapshot,
  MERGEABLE_RETRIES,
  MERGEABLE_RETRY_DELAY_MS,
} from '../../../src/github/snapshot.ts';
import { type GithubReplay, startGithubReplay } from '../../support/github-replay.ts';

const REPO = 'octo/helm';
const HEAD_SHA = 'abc123';
const PULL_PATH = `/repos/${REPO}/pulls/7`;

let replay: GithubReplay | undefined;

afterEach(async () => {
  await replay?.close();
  replay = undefined;
});

/** A 200 response with `body`. */
function ok(body: unknown, headers: Record<string, string> = {}): RecordedResponse[] {
  return [{ status: 200, headers, body }];
}

/** The pull request endpoint's body, with overrides. */
function pull(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 7,
    title: 'fix(urlutil): keep trailing slash',
    body: 'Fixes #10, see also `#99` and helm/helm#5',
    html_url: 'https://github.com/octo/helm/pull/7',
    draft: false,
    user: { login: 'ada', type: 'User' },
    author_association: 'CONTRIBUTOR',
    created_at: '2026-11-01T00:00:00Z',
    base: { ref: 'main' },
    head: { sha: HEAD_SHA },
    labels: [{ name: 'bug' }],
    mergeable: true,
    mergeable_state: 'clean',
    ...overrides,
  };
}

/** A recording of a whole pull request; `overrides` replaces any key. */
function pullRecording(overrides: Recording = {}): Recording {
  return {
    [`GET ${PULL_PATH}`]: ok(pull()),
    [`GET ${PULL_PATH}/commits?per_page=100`]: ok(
      [
        {
          sha: 'c1',
          commit: {
            message: 'fix: one\n\nSigned-off-by: Ada <ada@example.com>',
            author: { name: 'Ada', email: 'ada@example.com', date: '2026-11-01T00:00:00Z' },
            committer: { date: '2026-11-01T01:00:00Z' },
          },
          author: { login: 'ada', type: 'User' },
          parents: [{}],
        },
      ],
      { link: `<${PULL_PATH}/commits?per_page=100&page=2>; rel="next"` },
    ),
    [`GET ${PULL_PATH}/commits?per_page=100&page=2`]: ok([
      {
        sha: 'c2',
        commit: {
          message: 'Merge branch main',
          author: { name: 'Unlinked Person', email: 'u@example.com', date: '2026-11-02T00:00:00Z' },
          committer: { date: '2026-11-02T01:00:00Z' },
        },
        author: null,
        parents: [{}, {}],
      },
    ]),
    [`GET ${PULL_PATH}/files?per_page=100`]: ok([
      {
        filename: 'internal/urlutil/urlutil.go',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: '@@ -1 +1,2 @@',
      },
      {
        filename: 'new.go',
        previous_filename: 'old.go',
        status: 'renamed',
        additions: 0,
        deletions: 0,
      },
    ]),
    [`GET ${PULL_PATH}/reviews?per_page=100`]: ok([
      {
        user: { login: 'maintainer', type: 'User' },
        state: 'CHANGES_REQUESTED',
        author_association: 'MEMBER',
        submitted_at: '2026-11-03T00:00:00Z',
      },
      { user: { login: 'drafter', type: 'User' }, state: 'PENDING', author_association: 'NONE' },
    ]),
    [`GET /repos/${REPO}/issues/7/comments?per_page=100`]: ok([
      { user: { login: 'dco-bot', type: 'Bot' }, created_at: '2026-11-01T02:00:00Z' },
    ]),
    [`GET ${PULL_PATH}/comments?per_page=100`]: ok([
      { user: { login: 'linter[bot]', type: 'User' }, created_at: '2026-11-04T00:00:00Z' },
    ]),
    [`GET /repos/${REPO}/commits/${HEAD_SHA}/check-runs?per_page=100`]: ok({
      total_count: 2,
      check_runs: [
        { name: 'build', status: 'completed', conclusion: 'success' },
        { name: 'lint', status: 'in_progress', conclusion: null },
      ],
    }),
    [`GET /repos/${REPO}/commits/${HEAD_SHA}/status?per_page=100`]: ok({
      statuses: [{ context: 'DCO', state: 'error' }],
    }),
    'GET /search/issues?q=repo%3Aocto%2Fhelm%20is%3Apr%20is%3Aopen%2010&per_page=100': ok({
      items: [
        {
          number: 7,
          title: 'this pull request itself',
          body: 'Fixes #10',
          html_url: 'https://github.com/octo/helm/pull/7',
          user: { login: 'ada' },
          created_at: '2026-11-01T00:00:00Z',
          pull_request: {},
        },
        {
          number: 3,
          title: 'urlutil: another fix',
          body: 'Closes #10',
          html_url: 'https://github.com/octo/helm/pull/3',
          user: { login: 'bob' },
          created_at: '2026-10-01T00:00:00Z',
          pull_request: {},
        },
        {
          number: 4,
          title: 'mentions 10 only in prose',
          body: 'bumps a timeout to 10s',
          html_url: 'https://github.com/octo/helm/pull/4',
          user: { login: 'carol' },
          created_at: '2026-10-02T00:00:00Z',
          pull_request: {},
        },
      ],
    }),
    ...overrides,
  };
}

/** Starts a replay of `recording` and returns a config pointed at it. */
async function replayConfig(recording: Recording) {
  replay = await startGithubReplay(recording);

  return loadConfig({ GITHUB_TOKEN: 'test-token', HELM_TRIAGE_GITHUB_API_URL: replay.url });
}

describe('fetchPrSnapshot', () => {
  test('builds the snapshot from every endpoint', async () => {
    const config = await replayConfig(pullRecording());

    const snapshot = await fetchPrSnapshot(config, REPO, 7);

    expect(snapshot).toMatchObject({
      repo: REPO,
      number: 7,
      headSha: HEAD_SHA,
      mergeableState: 'clean',
      labels: ['bug'],
      linkedIssues: [10],
      author: { login: 'ada', isBot: false, association: 'CONTRIBUTOR' },
    });
    expect(snapshot.commits.map((commit) => [commit.sha, commit.isMerge])).toEqual([
      ['c1', false],
      ['c2', true],
    ]);
    expect(snapshot.files[1]).toEqual({
      path: 'new.go',
      previousPath: 'old.go',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    });
    expect(snapshot.reviews).toEqual([
      {
        reviewer: 'maintainer',
        isBot: false,
        state: 'changes_requested',
        association: 'MEMBER',
        submittedAt: new Date('2026-11-03T00:00:00Z'),
      },
    ]);
  });

  test('lists comments, reviews, and commits oldest first with bot flags', async () => {
    const config = await replayConfig(pullRecording());

    const snapshot = await fetchPrSnapshot(config, REPO, 7);

    expect(snapshot.activity.map(({ actor, isBot, kind }) => [actor, isBot, kind])).toEqual([
      ['ada', false, 'commit'],
      ['dco-bot', true, 'comment'],
      ['Unlinked Person', false, 'commit'],
      ['maintainer', false, 'review'],
      ['linter[bot]', true, 'comment'],
    ]);
  });

  test('maps check runs and commit statuses onto one CI state', async () => {
    const config = await replayConfig(pullRecording());

    const snapshot = await fetchPrSnapshot(config, REPO, 7);

    expect(snapshot.ci).toEqual({
      state: 'failure',
      checks: [
        { name: 'build', conclusion: 'success' },
        { name: 'lint', conclusion: 'pending' },
        { name: 'DCO', conclusion: 'failure' },
      ],
    });
  });

  test('finds other open pull requests that reference the same issue', async () => {
    const config = await replayConfig(pullRecording());

    const snapshot = await fetchPrSnapshot(config, REPO, 7);

    expect(snapshot.relatedOpenPrs).toEqual([
      {
        number: 3,
        title: 'urlutil: another fix',
        url: 'https://github.com/octo/helm/pull/3',
        author: 'bob',
        createdAt: new Date('2026-10-01T00:00:00Z'),
        sharedIssues: [10],
      },
    ]);
  });

  test('asks again while GitHub is computing mergeability', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET ${PULL_PATH}`]: [
          ...ok(pull({ mergeable: null, mergeable_state: 'unknown' })),
          ...ok(pull({ mergeable: false, mergeable_state: 'dirty' })),
        ],
      }),
    );
    const sleeps: number[] = [];

    const snapshot = await fetchPrSnapshot(config, REPO, 7, {
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    expect(snapshot.mergeableState).toBe('dirty');
    expect(sleeps).toEqual([MERGEABLE_RETRY_DELAY_MS]);
    expect(replay?.requests.filter((request) => request === `GET ${PULL_PATH}`)).toHaveLength(2);
  });

  test('reports unknown when mergeability never settles', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET ${PULL_PATH}`]: ok(pull({ mergeable: null, mergeable_state: 'unknown' })),
      }),
    );
    const sleeps: number[] = [];

    const snapshot = await fetchPrSnapshot(config, REPO, 7, {
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    expect(snapshot.mergeableState).toBe('unknown');
    expect(sleeps).toHaveLength(MERGEABLE_RETRIES);
  });

  test('a check run that failed to start counts as a failure', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET /repos/${REPO}/commits/${HEAD_SHA}/check-runs?per_page=100`]: ok({
          check_runs: [{ name: 'build', status: 'completed', conclusion: 'startup_failure' }],
        }),
      }),
    );

    const snapshot = await fetchPrSnapshot(config, REPO, 7);

    expect(snapshot.ci.checks[0]).toEqual({ name: 'build', conclusion: 'failure' });
  });

  test('an unknown check run conclusion fails naming the request', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET /repos/${REPO}/commits/${HEAD_SHA}/check-runs?per_page=100`]: ok({
          check_runs: [{ name: 'build', status: 'completed', conclusion: 'exploded' }],
        }),
      }),
    );

    const fetching = fetchPrSnapshot(config, REPO, 7);

    await expect(fetching).rejects.toThrow(
      `GitHub GET /repos/${REPO}/commits/${HEAD_SHA}/check-runs returned an unknown check run conclusion "exploded" on build`,
    );
  });

  test('an unknown commit status state fails naming the request', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET /repos/${REPO}/commits/${HEAD_SHA}/status?per_page=100`]: ok({
          statuses: [{ context: 'DCO', state: 'weird' }],
        }),
      }),
    );

    const fetching = fetchPrSnapshot(config, REPO, 7);

    await expect(fetching).rejects.toThrow('returned an unknown status state "weird" on DCO');
  });

  test('a missing pull request fails naming the request', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET ${PULL_PATH}`]: [{ status: 404, headers: {}, body: { message: 'Not Found' } }],
      }),
    );

    const fetching = fetchPrSnapshot(config, REPO, 7);

    await expect(fetching).rejects.toThrow(`GitHub GET ${PULL_PATH} was not found (404)`);
  });

  test('a rate-limited request fails naming the request and the reset time', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET ${PULL_PATH}/files?per_page=100`]: [
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1794528000' },
            body: { message: 'API rate limit exceeded' },
          },
        ],
      }),
    );

    const fetching = fetchPrSnapshot(config, REPO, 7);

    await expect(fetching).rejects.toThrow(
      `GitHub GET ${PULL_PATH}/files?per_page=100 hit the GitHub rate limit; it resets at 2026-11-13T00:00:00.000Z`,
    );
  });

  test('a rejected token fails naming the request and the variable', async () => {
    const config = await replayConfig(
      pullRecording({
        [`GET ${PULL_PATH}`]: [{ status: 401, headers: {}, body: { message: 'Bad credentials' } }],
      }),
    );

    const fetching = fetchPrSnapshot(config, REPO, 7);

    await expect(fetching).rejects.toThrow(
      `GitHub GET ${PULL_PATH} was rejected (401): check that GITHUB_TOKEN`,
    );
  });
});
