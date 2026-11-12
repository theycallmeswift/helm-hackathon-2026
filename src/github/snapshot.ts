/**
 * Turns a pull request number into a `PrSnapshot` with the GitHub REST API:
 * the pull request, its commits, files, reviews, comments, CI results, and
 * other open pull requests that reference the same issues.
 */

import { setTimeout as delay } from 'node:timers/promises';

import { type Config, requireGithubToken } from '../config/load.ts';
import type {
  AuthorAssociation,
  CiCheck,
  CiConclusion,
  CiState,
  FileStatus,
  MergeableState,
  PrActivity,
  PrCommit,
  PrFile,
  PrReview,
  PrSnapshot,
  RelatedPr,
  RepoName,
  ReviewState,
} from '../pr/types.ts';
import { createGithubClient, type Fetch, GithubApiError, type GithubClient } from './client.ts';
import { parseLinkedIssues } from './linked-issues.ts';

/** How many times to ask again while GitHub is still computing mergeability. */
export const MERGEABLE_RETRIES = 3;

/** How long to wait between those attempts. */
export const MERGEABLE_RETRY_DELAY_MS = 1000;

/** Edges a caller can replace: the network, for recording, and the clock, for tests. */
export interface FetchSnapshotOptions {
  fetch?: Fetch;
  /** Waits `milliseconds`; defaults to a real timer. */
  sleep?: (milliseconds: number) => Promise<void>;
}

/** A GitHub account as REST responses embed it. */
interface GithubUser {
  login: string;
  type: string;
}

/** The fields read from `GET /repos/{repo}/pulls/{number}`. */
interface GithubPull {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  draft?: boolean;
  user: GithubUser;
  author_association: AuthorAssociation;
  created_at: string;
  base: { ref: string };
  head: { sha: string };
  labels: { name: string }[];
  mergeable: boolean | null;
  mergeable_state: string;
}

/** One entry from the pull request commits endpoint. */
interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    committer: { date: string };
  };
  author: GithubUser | null;
  parents: unknown[];
}

/** One entry from the pull request files endpoint. */
interface GithubFile {
  filename: string;
  previous_filename?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch?: string;
}

/** One entry from the reviews endpoint. */
interface GithubReview {
  user: GithubUser | null;
  state: string;
  author_association: AuthorAssociation;
  submitted_at?: string;
}

/** One issue comment or review comment. */
interface GithubComment {
  user: GithubUser | null;
  created_at: string;
}

/** One entry from the check runs endpoint. */
interface GithubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/** The combined status endpoint's body. */
interface GithubCombinedStatus {
  statuses: { context: string; state: string }[];
}

/** One search result from the issue search endpoint. */
interface GithubSearchItem {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: GithubUser;
  created_at: string;
  pull_request?: unknown;
}

/** GitHub's `mergeable_state` values, which `MergeableState` mirrors. */
const MERGEABLE_STATES: readonly MergeableState[] = [
  'clean',
  'dirty',
  'blocked',
  'unstable',
  'behind',
  'has_hooks',
  'draft',
  'unknown',
];

/** Check run conclusions that already match a `CiConclusion`. */
const CHECK_CONCLUSIONS: readonly CiConclusion[] = [
  'success',
  'failure',
  'neutral',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
  'stale',
];

/** Commit status states, mapped onto check conclusions. */
const STATUS_CONCLUSIONS: Readonly<Record<string, CiConclusion>> = {
  success: 'success',
  failure: 'failure',
  error: 'failure',
  pending: 'pending',
};

/**
 * Fetches everything the checks and the AI layer read about pull request
 * `number` in `repo`.
 *
 * @throws {MissingSecretError} when `GITHUB_TOKEN` is unset.
 * @throws {GithubApiError} when a request fails, naming the request.
 */
export async function fetchPrSnapshot(
  config: Config,
  repo: RepoName,
  number: number,
  options: FetchSnapshotOptions = {},
): Promise<PrSnapshot> {
  const client = createGithubClient({
    baseUrl: config.githubApiUrl,
    token: requireGithubToken(config),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const pullPath = `/repos/${repo}/pulls/${number}`;
  const pull = await fetchSettledPull(client, pullPath, options.sleep ?? defaultSleep);
  const headSha = pull.head.sha;
  const linkedIssues = parseLinkedIssues(pull.title, pull.body ?? '');

  const [commits, files, reviews, issueComments, reviewComments, checkRuns, status, related] =
    await Promise.all([
      client.getAll<GithubCommit>(`${pullPath}/commits`),
      client.getAll<GithubFile>(`${pullPath}/files`),
      client.getAll<GithubReview>(`${pullPath}/reviews`),
      client.getAll<GithubComment>(`/repos/${repo}/issues/${number}/comments`),
      client.getAll<GithubComment>(`${pullPath}/comments`),
      client.getAll<GithubCheckRun>(`/repos/${repo}/commits/${headSha}/check-runs`, 'check_runs'),
      client.get<GithubCombinedStatus>(`/repos/${repo}/commits/${headSha}/status?per_page=100`),
      fetchRelatedOpenPrs(client, repo, number, linkedIssues),
    ]);
  const submittedReviews = reviews.filter((review) => review.state !== 'PENDING');

  return {
    repo,
    number: pull.number,
    title: pull.title,
    body: pull.body ?? '',
    url: pull.html_url,
    isDraft: pull.draft === true,
    author: {
      login: pull.user.login,
      isBot: isBot(pull.user),
      association: pull.author_association,
    },
    createdAt: new Date(pull.created_at),
    baseRef: pull.base.ref,
    headSha,
    labels: pull.labels.map((label) => label.name),
    linkedIssues,
    mergeableState: toMergeableState(pull, pullPath),
    commits: commits.map(toCommit),
    files: files.map(toFile),
    reviews: submittedReviews.map(toReview),
    activity: buildActivity(commits, submittedReviews, [...issueComments, ...reviewComments]),
    ci: buildCi(checkRuns, status),
    relatedOpenPrs: related,
  };
}

/** Waits on a real timer. */
async function defaultSleep(milliseconds: number): Promise<void> {
  await delay(milliseconds);
}

/**
 * GETs the pull request, asking again while `mergeable` is null because
 * GitHub is still computing it. After the last retry the pull request is
 * returned as is, and its mergeable state reads as `unknown`.
 */
async function fetchSettledPull(
  client: GithubClient,
  path: string,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<GithubPull> {
  let pull = await client.get<GithubPull>(path);
  for (let retry = 0; retry < MERGEABLE_RETRIES && pull.mergeable === null; retry++) {
    await sleep(MERGEABLE_RETRY_DELAY_MS);
    pull = await client.get<GithubPull>(path);
  }

  return pull;
}

/**
 * The pull request's mergeable state, or `unknown` while GitHub computes it.
 *
 * @throws {GithubApiError} when GitHub reports a state this tool does not know.
 */
function toMergeableState(pull: GithubPull, path: string): MergeableState {
  if (pull.mergeable === null) {
    return 'unknown';
  }

  const state = MERGEABLE_STATES.find((known) => known === pull.mergeable_state);
  if (state === undefined) {
    throw new GithubApiError(
      `GitHub GET ${path} returned an unknown mergeable_state "${pull.mergeable_state}"`,
      200,
    );
  }

  return state;
}

/** Whether an account is an app: GitHub's `Bot` type or a `[bot]` login. */
function isBot(user: GithubUser): boolean {
  return user.type === 'Bot' || user.login.endsWith('[bot]');
}

/** Maps one GitHub commit. */
function toCommit(commit: GithubCommit): PrCommit {
  return {
    sha: commit.sha,
    message: commit.commit.message,
    authorEmail: commit.commit.author.email,
    committedAt: new Date(commit.commit.committer.date),
    isMerge: commit.parents.length > 1,
  };
}

/** Maps one changed file. */
function toFile(file: GithubFile): PrFile {
  return {
    path: file.filename,
    ...(file.previous_filename === undefined ? {} : { previousPath: file.previous_filename }),
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.patch === undefined ? {} : { patch: file.patch }),
  };
}

/** Maps one submitted review, lowercasing its state. */
function toReview(review: GithubReview): PrReview {
  return {
    reviewer: review.user?.login ?? 'ghost',
    isBot: review.user === null ? false : isBot(review.user),
    state: review.state.toLowerCase() as ReviewState,
    association: review.author_association,
    submittedAt: new Date(review.submitted_at ?? 0),
  };
}

/**
 * Every comment, review, and commit as one timeline, oldest first. A commit
 * with no linked GitHub account is attributed to its git author name.
 */
function buildActivity(
  commits: GithubCommit[],
  reviews: GithubReview[],
  comments: GithubComment[],
): PrActivity[] {
  const commitEvents = commits.map(
    (commit): PrActivity => ({
      at: new Date(commit.commit.committer.date),
      actor: commit.author?.login ?? commit.commit.author.name,
      isBot: commit.author === null ? false : isBot(commit.author),
      kind: 'commit',
    }),
  );
  const reviewEvents = reviews.map((review): PrActivity => {
    const { reviewer, isBot: reviewerIsBot, submittedAt } = toReview(review);

    return { at: submittedAt, actor: reviewer, isBot: reviewerIsBot, kind: 'review' };
  });
  const commentEvents = comments.map(
    (comment): PrActivity => ({
      at: new Date(comment.created_at),
      actor: comment.user?.login ?? 'ghost',
      isBot: comment.user === null ? false : isBot(comment.user),
      kind: 'comment',
    }),
  );

  return [...commitEvents, ...reviewEvents, ...commentEvents].sort(
    (left, right) => left.at.getTime() - right.at.getTime(),
  );
}

/** The head commit's check runs and commit statuses, with the overall state. */
function buildCi(checkRuns: GithubCheckRun[], status: GithubCombinedStatus): PrSnapshot['ci'] {
  const checks: CiCheck[] = [
    ...checkRuns.map((run) => ({ name: run.name, conclusion: checkRunConclusion(run) })),
    ...status.statuses.map((commitStatus) => ({
      name: commitStatus.context,
      conclusion: STATUS_CONCLUSIONS[commitStatus.state] ?? 'pending',
    })),
  ];

  return { state: ciState(checks), checks };
}

/** A check run's conclusion, or `pending` while it is queued or running. */
function checkRunConclusion(run: GithubCheckRun): CiConclusion {
  if (run.status !== 'completed') {
    return 'pending';
  }

  return CHECK_CONCLUSIONS.find((known) => known === run.conclusion) ?? 'pending';
}

/** The overall CI state, in the order `CiState` documents. */
export function ciState(checks: CiCheck[]): CiState {
  const conclusions = new Set(checks.map((check) => check.conclusion));
  if (conclusions.size === 0) {
    return 'none';
  }

  if (
    ['failure', 'timed_out', 'cancelled'].some((failed) => conclusions.has(failed as CiConclusion))
  ) {
    return 'failure';
  }

  if (
    ['pending', 'action_required', 'stale'].some((waiting) =>
      conclusions.has(waiting as CiConclusion),
    )
  ) {
    return 'pending';
  }

  return 'success';
}

/**
 * Other open pull requests in `repo` whose title or body references any of
 * `linkedIssues`, found with one issue search per issue number.
 */
async function fetchRelatedOpenPrs(
  client: GithubClient,
  repo: RepoName,
  number: number,
  linkedIssues: number[],
): Promise<RelatedPr[]> {
  const searches = await Promise.all(
    linkedIssues.map((issue) =>
      client.getAll<GithubSearchItem>(
        `/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:open ${issue}`)}`,
        'items',
      ),
    ),
  );
  const candidates = new Map<number, GithubSearchItem>();
  for (const item of searches.flat()) {
    if (item.number !== number && item.pull_request !== undefined) {
      candidates.set(item.number, item);
    }
  }

  return [...candidates.values()]
    .map((item) => toRelatedPr(item, linkedIssues))
    .filter((related) => related.sharedIssues.length > 0)
    .sort((left, right) => left.number - right.number);
}

/** Maps a search result, keeping only the issues both pull requests reference. */
function toRelatedPr(item: GithubSearchItem, linkedIssues: number[]): RelatedPr {
  const theirIssues = new Set(parseLinkedIssues(item.title, item.body ?? ''));

  return {
    number: item.number,
    title: item.title,
    url: item.html_url,
    author: item.user.login,
    createdAt: new Date(item.created_at),
    sharedIssues: linkedIssues.filter((issue) => theirIssues.has(issue)),
  };
}
