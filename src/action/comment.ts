/**
 * Keeps one readiness comment on a pull request up to date: finds the
 * comment carrying the readiness marker and updates it, else creates it. It
 * only ever writes that one comment; it never labels, closes, or merges, and
 * it refuses the upstream Helm repository outright.
 */

import { createGithubClient, type Fetch, GithubApiError } from '../github/client.ts';
import type { RepoName } from '../pr/types.ts';
import { READINESS_MARKER } from '../report/markdown.ts';

/** The repository this tool must never write to. */
export const PROTECTED_REPO = 'helm/helm';

/** What `upsertReadinessComment` needs. */
export interface UpsertOptions {
  repo: RepoName;
  number: number;
  /** The rendered markdown report; it must contain `READINESS_MARKER`. */
  body: string;
  token: string;
  /** GitHub REST API base URL with no trailing slash. */
  apiUrl: string;
  /** Defaults to global `fetch`. */
  fetch?: Fetch;
}

/** What the upsert did, and to which comment. */
export interface UpsertResult {
  action: 'created' | 'updated';
  commentId: number;
}

/** A write the tool must not make was asked for. */
export class ProtectedRepoError extends Error {
  override name = 'ProtectedRepoError';
}

/** The fields read from an issue comment. */
interface IssueComment {
  id: number;
  body?: string;
}

/**
 * Creates or updates the one readiness comment on pull request `number`.
 *
 * @throws {ProtectedRepoError} for `helm/helm`, before any request.
 * @throws {GithubApiError} when a request fails.
 */
export async function upsertReadinessComment(options: UpsertOptions): Promise<UpsertResult> {
  refuseProtectedRepo(options.repo);
  if (!options.body.includes(READINESS_MARKER)) {
    throw new Error('the comment body has no readiness marker, so it could never be found again');
  }

  const fetchImpl = options.fetch ?? fetch;
  const client = createGithubClient({
    baseUrl: options.apiUrl,
    token: options.token,
    fetch: fetchImpl,
  });
  const commentsPath = `/repos/${options.repo}/issues/${options.number}/comments`;
  const comments = await client.getAll<IssueComment>(commentsPath);
  const existing = comments.find((comment) => comment.body?.includes(READINESS_MARKER));

  const [method, path] =
    existing === undefined
      ? (['POST', commentsPath] as const)
      : (['PATCH', `/repos/${options.repo}/issues/comments/${existing.id}`] as const);
  const response = await fetchImpl(`${options.apiUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ body: options.body }),
  });
  if (!response.ok) {
    const reason = (await response.text()).slice(0, 200);
    throw new GithubApiError(
      `GitHub ${method} ${path} failed (${response.status}): ${reason}`,
      response.status,
    );
  }
  const written = (await response.json()) as IssueComment;

  return { action: existing === undefined ? 'created' : 'updated', commentId: written.id };
}

/**
 * Stops any write to the upstream Helm repository.
 *
 * @throws {ProtectedRepoError} when `repo` is `helm/helm`, in any letter case.
 */
export function refuseProtectedRepo(repo: string): void {
  if (repo.toLowerCase() === PROTECTED_REPO) {
    throw new ProtectedRepoError(
      `refusing to post to ${PROTECTED_REPO}: this tool never writes to the upstream Helm repository`,
    );
  }
}
