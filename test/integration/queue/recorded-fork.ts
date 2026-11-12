/** The recorded fork pull requests, replayed as one open pull request listing. */

import { readdirSync } from 'node:fs';

import type { Recording } from '../../../src/github/recording.ts';
import type { RepoName } from '../../../src/pr/types.ts';
import { loadRecording, RECORDED_DIR } from '../../support/github-replay.ts';

/** The fork the pull requests were recorded from. */
export const FORK_REPO: RepoName = 'theycallmeswift/helm';

/** The request the open pull request listing makes. */
const LISTING_KEY = `GET /repos/${FORK_REPO}/pulls?state=open&sort=created&direction=asc&per_page=100`;

/**
 * Every recorded fork pull request in one recording, plus a listing of them
 * oldest opened first, built from their recorded pull request bodies.
 */
export function recordedFork(): Recording {
  const recording: Recording = {};
  for (const fileName of readdirSync(RECORDED_DIR).filter((name) => /^pr-\d+\.json$/.test(name))) {
    Object.assign(recording, loadRecording(fileName));
  }
  const pulls = Object.entries(recording)
    .filter(([key]) => new RegExp(`^GET /repos/${FORK_REPO}/pulls/\\d+$`).test(key))
    .map(([, responses]) => responses.at(-1)?.body as { number: number; created_at: string })
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  recording[LISTING_KEY] = [{ status: 200, headers: {}, body: pulls }];

  return recording;
}
