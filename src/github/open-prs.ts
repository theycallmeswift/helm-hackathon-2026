/**
 * Lists a repository's open pull requests, oldest opened first, and matches
 * the ones that reference the same issues.
 */

import { type Config, requireGithubToken } from '../config/load.ts';
import type { RelatedPr, RepoName } from '../pr/types.ts';
import { createGithubClient, type Fetch } from './client.ts';
import { parseLinkedIssues } from './linked-issues.ts';

/** One open pull request, as much as related pull request matching reads. */
export interface OpenPr {
  number: number;
  title: string;
  url: string;
  /** The author's login. */
  author: string;
  createdAt: Date;
  /** Issue numbers its title and body reference, ascending. */
  linkedIssues: number[];
}

/**
 * The fields read from a pull request in a list: `GET /repos/{repo}/pulls`
 * items and `/search/issues` results share them.
 */
export interface GithubPullSummary {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string };
  created_at: string;
}

/**
 * Every open pull request in `repo`, oldest opened first, reading every page.
 *
 * @throws {MissingSecretError} when `GITHUB_TOKEN` is unset.
 * @throws {GithubApiError} when a request fails, naming the request.
 */
export async function listOpenPrs(
  config: Config,
  repo: RepoName,
  options: { fetch?: Fetch } = {},
): Promise<OpenPr[]> {
  const client = createGithubClient({
    baseUrl: config.githubApiUrl,
    token: requireGithubToken(config),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const pulls = await client.getAll<GithubPullSummary>(
    `/repos/${repo}/pulls?state=open&sort=created&direction=asc`,
  );

  return pulls.map(toOpenPr);
}

/** Maps a listed or searched pull request, parsing the issues it references. */
export function toOpenPr(pull: GithubPullSummary): OpenPr {
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    author: pull.user.login,
    createdAt: new Date(pull.created_at),
    linkedIssues: parseLinkedIssues(pull.title, pull.body ?? ''),
  };
}

/**
 * The pull requests in `openPrs`, other than `number`, that reference any of
 * `linkedIssues`, each with the issues both reference, lowest number first.
 */
export function findRelatedPrs(
  number: number,
  linkedIssues: number[],
  openPrs: OpenPr[],
): RelatedPr[] {
  const related = new Map<number, RelatedPr>();
  for (const other of openPrs) {
    const theirIssues = new Set(other.linkedIssues);
    const sharedIssues = linkedIssues.filter((issue) => theirIssues.has(issue));
    if (other.number === number || sharedIssues.length === 0) {
      continue;
    }

    related.set(other.number, {
      number: other.number,
      title: other.title,
      url: other.url,
      author: other.author,
      createdAt: other.createdAt,
      sharedIssues,
    });
  }

  return [...related.values()].sort((left, right) => left.number - right.number);
}
