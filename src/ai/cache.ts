/**
 * The on-disk cache of AI flags. One file per pull request head commit, at
 * `<cacheDir>/ai-flags/<owner>/<name>/<number>/<headSha>.json`, holding the
 * model that produced the flags. A new push changes the head SHA, so stale
 * flags are never read; only `ok` outcomes are written.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AiFlags, AiOutcome, RepoName } from '../pr/types.ts';

/** The `ok` outcome, the only one the cache holds. */
export type CachedAiFlags = Extract<AiOutcome, { status: 'ok' }>;

/** The path of the cache file for one head commit. */
function cachePath(cacheDir: string, repo: RepoName, number: number, headSha: string): string {
  const [owner = '', name = ''] = repo.split('/');

  return join(cacheDir, 'ai-flags', owner, name, String(number), `${headSha}.json`);
}

/**
 * Reads cached flags for one head commit, from whichever model produced them.
 * Makes no request.
 *
 * @returns the cached `ok` outcome, or undefined when nothing is cached.
 */
export async function readCachedAiFlags(
  cacheDir: string,
  repo: RepoName,
  number: number,
  headSha: string,
): Promise<CachedAiFlags | undefined> {
  let text: string;
  try {
    text = await readFile(cachePath(cacheDir, repo, number, headSha), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  const { model, flags } = JSON.parse(text) as { model: string; flags: AiFlags };

  return { status: 'ok', model, flags };
}

/** Writes flags for one head commit, replacing any earlier entry. */
export async function writeCachedAiFlags(
  cacheDir: string,
  repo: RepoName,
  number: number,
  headSha: string,
  outcome: CachedAiFlags,
): Promise<void> {
  const path = cachePath(cacheDir, repo, number, headSha);
  await mkdir(dirname(path), { recursive: true });

  // Write then rename, so a concurrent reader never sees half a file.
  const partialPath = `${path}.${process.pid}.tmp`;
  await writeFile(partialPath, JSON.stringify({ model: outcome.model, flags: outcome.flags }));
  await rename(partialPath, path);
}

/** Whether `error` is the file-not-found error from `node:fs`. */
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
