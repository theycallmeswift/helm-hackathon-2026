import { afterEach, expect, test } from 'vitest';

import { loadConfig } from '../../../src/config/load.ts';
import { buildQueue } from '../../../src/queue/build.ts';
import { renderQueueHtml } from '../../../src/queue/html.ts';
import { renderQueueMarkdown, renderQueueText } from '../../../src/queue/render.ts';
import { type GithubReplay, startGithubReplay } from '../../support/github-replay.ts';
import { FORK_REPO as REPO, recordedFork } from './recorded-fork.ts';

/** A day after the fork's pull requests were opened, so none is stale. */
const NOW = new Date('2026-11-13T12:00:00Z');

let replay: GithubReplay | undefined;

afterEach(async () => {
  await replay?.close();
  replay = undefined;
});

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

test('queue matches duplicates from the open PR listing without searching', async () => {
  const sections = await forkQueue();

  const duplicates = sections.find((section) => section.bucket === 'duplicate')?.entries ?? [];
  expect(duplicates.map((entry) => [entry.snapshot.number, entry.reason])).toEqual([
    [14, 'duplicates earlier #13'],
    [16, 'duplicates earlier #15'],
  ]);
  expect(replay?.requests.filter((request) => request.includes('/search/'))).toEqual([]);
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

test('queue renders the recorded fork PRs as an HTML page with linked numbers', async () => {
  const sections = await forkQueue();

  const page = renderQueueHtml(sections, { repo: REPO, now: NOW });

  expect(page).toContain('<h1>PR queue: theycallmeswift/helm</h1>');
  expect(page).toContain('<h2>Duplicate (2)</h2>');
  expect(page).toContain('<h2>Ready for review (7)</h2>');
  expect(page).toContain('<a href="https://github.com/theycallmeswift/helm/pull/14">#14</a>');
  expect(page.match(/<tr><td class="col-pr">/g)).toHaveLength(13);
  expect(page).not.toMatch(/<script|<link|src=/);
});
