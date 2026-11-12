#!/usr/bin/env node
/**
 * Records the GitHub responses for every pull request in the test fork's
 * answer key, so tests replay them offline. It only reads from GitHub.
 *
 * Usage: GITHUB_TOKEN=$(gh auth token) node scripts/record-fixtures.ts [--pr N]...
 *
 * Writes `test/fixtures/recorded/pr-<N>.json` per pull request, with tokens
 * removed. A pull request that does not exist yet is reported and skipped; one
 * whose mergeability GitHub is still computing is not written, and the run fails.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig, parseRepoName, requireGithubToken } from '../src/config/load.ts';
import { GithubApiError } from '../src/github/client.ts';
import { type Recording, recordingFetch } from '../src/github/recording.ts';
import { fetchPrSnapshot } from '../src/github/snapshot.ts';

const FIXTURES_DIR = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const MANIFEST_PATH = join(FIXTURES_DIR, 'synthetic-prs.json');
const RECORDED_DIR = join(FIXTURES_DIR, 'recorded');

/** The answer key fields the recorder reads. */
interface Manifest {
  repo: string;
  prs: { id: string; pr_number: number }[];
}

const { values } = parseArgs({ options: { pr: { type: 'string', multiple: true } } });
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const repo = parseRepoName(manifest.repo, MANIFEST_PATH);
const config = loadConfig(process.env);
const token = requireGithubToken(config);
const wanted = values.pr?.map(Number);
const prs = manifest.prs.filter((pr) => wanted === undefined || wanted.includes(pr.pr_number));
const missing: string[] = [];
const unsettled: string[] = [];

mkdirSync(RECORDED_DIR, { recursive: true });
for (const pr of prs) {
  const recording: Recording = {};
  const fetch = recordingFetch({
    inner: globalThis.fetch,
    baseUrl: config.githubApiUrl,
    token,
    recording,
  });
  try {
    const snapshot = await fetchPrSnapshot(config, repo, pr.pr_number, { fetch });
    if (snapshot.mergeableState === 'unknown') {
      unsettled.push(`${pr.id} (#${pr.pr_number})`);
      continue;
    }
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      missing.push(`${pr.id} (#${pr.pr_number})`);
      continue;
    }

    throw error;
  }

  writeFileSync(
    join(RECORDED_DIR, `pr-${pr.pr_number}.json`),
    `${JSON.stringify(recording, null, 2)}\n`,
  );
  process.stdout.write(
    `recorded ${pr.id} (#${pr.pr_number}): ${Object.keys(recording).length} requests\n`,
  );
}

if (missing.length > 0) {
  process.stdout.write(`not found, skipped: ${missing.join(', ')}\n`);
}

if (unsettled.length > 0) {
  process.stderr.write(
    `GitHub was still computing mergeability, not recorded; run again: ${unsettled.join(', ')}\n`,
  );
  process.exitCode = 1;
}
