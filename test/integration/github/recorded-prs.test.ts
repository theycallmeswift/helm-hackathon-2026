import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { loadConfig } from '../../../src/config/load.ts';
import { fetchPrSnapshot } from '../../../src/github/snapshot.ts';
import type { RepoName } from '../../../src/pr/types.ts';
import {
  type GithubReplay,
  loadRecording,
  RECORDED_DIR,
  startGithubReplay,
} from '../../support/github-replay.ts';

/** The answer key fields these tests assert against; `null` means not asserted. */
interface Manifest {
  repo: RepoName;
  prs: {
    id: string;
    pr_number: number;
    files_changed: number | string[];
    expected: {
      conflict: boolean | null;
      linked_issue: number | null;
      duplicate_of: number | null;
      draft: boolean | null;
    };
  }[];
}

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../fixtures/synthetic-prs.json', import.meta.url), 'utf8'),
) as Manifest;

let replay: GithubReplay | undefined;

afterEach(async () => {
  await replay?.close();
  replay = undefined;
});

test.for(MANIFEST.prs)('$id (#$pr_number) matches the answer key', async (pr, { skip }) => {
  const fileName = `pr-${pr.pr_number}.json`;
  skip(!existsSync(join(RECORDED_DIR, fileName)), `${fileName} is not recorded yet`);
  const recording = loadRecording(fileName);
  replay = await startGithubReplay(recording);
  const config = loadConfig({ GITHUB_TOKEN: 'test-token', HELM_TRIAGE_GITHUB_API_URL: replay.url });
  const recordedPull = recording[`GET /repos/${MANIFEST.repo}/pulls/${pr.pr_number}`]?.at(-1)
    ?.body as { head: { sha: string }; commits: number };

  const snapshot = await fetchPrSnapshot(config, MANIFEST.repo, pr.pr_number, {
    sleep: async () => {},
  });

  const { expected } = pr;
  expect(snapshot.headSha).toBe(recordedPull.head.sha);
  expect(snapshot.commits).toHaveLength(recordedPull.commits);
  if (Array.isArray(pr.files_changed)) {
    expect(snapshot.files.map((file) => file.path).sort()).toEqual([...pr.files_changed].sort());
  } else {
    expect(snapshot.files).toHaveLength(pr.files_changed);
  }
  if (expected.draft !== null) {
    expect(snapshot.isDraft).toBe(expected.draft);
  }
  if (expected.conflict !== null) {
    expect(snapshot.mergeableState).not.toBe('unknown');
    expect(snapshot.mergeableState === 'dirty').toBe(expected.conflict);
  }
  expect(snapshot.closingIssues).toEqual(
    expected.linked_issue === null ? [] : [expected.linked_issue],
  );
  if (expected.duplicate_of !== null) {
    expect(snapshot.relatedOpenPrs.map((related) => related.number)).toContain(
      expected.duplicate_of,
    );
  }
});
