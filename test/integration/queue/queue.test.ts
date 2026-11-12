import { readdirSync } from 'node:fs';

import { afterEach, expect, test } from 'vitest';

import { loadConfig } from '../../../src/config/load.ts';
import type { Recording } from '../../../src/github/recording.ts';
import type { RepoName } from '../../../src/pr/types.ts';
import { buildQueue } from '../../../src/queue/build.ts';
import { renderQueueMarkdown, renderQueueText } from '../../../src/queue/render.ts';
import {
  type GithubReplay,
  loadRecording,
  RECORDED_DIR,
  startGithubReplay,
} from '../../support/github-replay.ts';

const REPO: RepoName = 'theycallmeswift/helm';

/** The request the open pull request listing makes. */
const LISTING_KEY = `GET /repos/${REPO}/pulls?state=open&sort=created&direction=asc&per_page=100`;

/** A day after the fork's pull requests were opened, so none is stale. */
const NOW = new Date('2026-11-13T12:00:00Z');

let replay: GithubReplay | undefined;

afterEach(async () => {
  await replay?.close();
  replay = undefined;
});

/**
 * Every recorded fork pull request in one recording, plus a listing of them
 * oldest opened first, built from their recorded pull request bodies.
 */
function recordedFork(): Recording {
  const recording: Recording = {};
  for (const fileName of readdirSync(RECORDED_DIR).filter((name) => /^pr-\d+\.json$/.test(name))) {
    Object.assign(recording, loadRecording(fileName));
  }
  const pulls = Object.entries(recording)
    .filter(([key]) => new RegExp(`^GET /repos/${REPO}/pulls/\\d+$`).test(key))
    .map(([, responses]) => responses.at(-1)?.body as { number: number; created_at: string })
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  recording[LISTING_KEY] = [{ status: 200, headers: {}, body: pulls }];

  return recording;
}

/** Builds the queue for the fork against the replay server. */
async function forkQueue(limit?: number) {
  replay = await startGithubReplay(recordedFork());
  const config = loadConfig({ GITHUB_TOKEN: 'test-token', HELM_TRIAGE_GITHUB_API_URL: replay.url });

  return buildQueue(config, {
    repo: REPO,
    now: NOW,
    sleep: async () => {},
    ...(limit === undefined ? {} : { limit }),
  });
}

test('queue sorts the recorded fork PRs into buckets, oldest waiting first', async () => {
  const sections = await forkQueue();

  const numbersByBucket = Object.fromEntries(
    sections.map((section) => [
      section.bucket,
      section.entries.map((entry) => entry.snapshot.number),
    ]),
  );
  expect(numbersByBucket).toEqual({
    draft: [2],
    duplicate: [14, 16],
    stale: [],
    'needs-author': [3, 6, 9],
    'needs-second-approval': [],
    ready: [1, 4, 5, 7, 8, 13, 15],
  });
});

test('queue --limit fetches only the oldest opened PRs', async () => {
  const sections = await forkQueue(3);

  const queued = sections.flatMap((section) =>
    section.entries.map((entry) => entry.snapshot.number),
  );
  expect(queued.sort((left, right) => left - right)).toEqual([1, 2, 3]);
  expect(replay?.requests.filter((request) => /\/pulls\/\d+$/.test(request))).toHaveLength(3);
});

test('queue renders a section per bucket with counts in both formats', async () => {
  const sections = await forkQueue();

  const text = renderQueueText(sections, NOW);
  const markdown = renderQueueMarkdown(sections, NOW);

  expect(text).toMatch(/^Duplicate \(2\)\n {2}#14 .*duplicates earlier #13$/m);
  expect(markdown).toContain('## Stale (0)');
  expect(markdown).toMatch(/^\| PR \| Title \| Author \| Age \| Waiting since \| Reason \|$/m);
});
