/** Lists a repository's open pull requests, oldest opened first. */

import { type Config, requireGithubToken } from '../config/load.ts';
import type { RepoName } from '../pr/types.ts';
import { createGithubClient, type Fetch } from './client.ts';

/** The one field read from each item of `GET /repos/{repo}/pulls`. */
interface GithubPullListItem {
  number: number;
}

/**
 * The numbers of every open pull request in `repo`, oldest opened first,
 * reading every page.
 *
 * @throws {MissingSecretError} when `GITHUB_TOKEN` is unset.
 * @throws {GithubApiError} when a request fails, naming the request.
 */
export async function listOpenPrNumbers(
  config: Config,
  repo: RepoName,
  options: { fetch?: Fetch } = {},
): Promise<number[]> {
  const client = createGithubClient({
    baseUrl: config.githubApiUrl,
    token: requireGithubToken(config),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const pulls = await client.getAll<GithubPullListItem>(
    `/repos/${repo}/pulls?state=open&sort=created&direction=asc`,
  );

  return pulls.map((pull) => pull.number);
}
