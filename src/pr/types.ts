/**
 * Shared types for one pull request's triage: the snapshot the GitHub
 * fetcher builds, the results the checks return, the advisory flags the AI
 * layer returns, and the report the renderers print. Every stage reads and
 * writes these, so they are the contract between them.
 */

/** A GitHub repository as `owner/name`, for example `helm/helm`. */
export type RepoName = `${string}/${string}`;

/** How an author or reviewer relates to the repository, as GitHub reports it. */
export type AuthorAssociation =
  | 'OWNER'
  | 'MEMBER'
  | 'COLLABORATOR'
  | 'CONTRIBUTOR'
  | 'FIRST_TIME_CONTRIBUTOR'
  | 'FIRST_TIMER'
  | 'MANNEQUIN'
  | 'NONE';

/** The person or app that opened the pull request. */
export interface PrAuthor {
  /** GitHub login, such as `octocat` or `dependabot[bot]`. */
  login: string;
  /** Whether the account is an app or a `[bot]` login. */
  isBot: boolean;
  association: AuthorAssociation;
}

/**
 * GitHub's `mergeable_state`. `dirty` means merge conflicts; `blocked` means
 * branch protection, not a defect; `unknown` means GitHub had not finished
 * computing it.
 */
export type MergeableState =
  | 'clean'
  | 'dirty'
  | 'blocked'
  | 'unstable'
  | 'behind'
  | 'has_hooks'
  | 'draft'
  | 'unknown';

/** One commit on the pull request's branch. */
export interface PrCommit {
  sha: string;
  /** The full message, including trailers such as `Signed-off-by:`. */
  message: string;
  /** The git author email, compared against `Signed-off-by:` trailers. */
  authorEmail: string;
  /** When the commit was made, per its committer date. */
  committedAt: Date;
  /** Whether the commit has more than one parent. */
  isMerge: boolean;
}

/** How a file changed, as GitHub's pull request files endpoint reports it. */
export type FileStatus =
  | 'added'
  | 'removed'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged';

/** One file the pull request changes. */
export interface PrFile {
  /** Repository-relative path after the change. */
  path: string;
  /** The path before a rename or copy; absent otherwise. */
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  /** The unified diff; absent when GitHub omits it, as for binary or huge files. */
  patch?: string;
}

/** A submitted review's verdict. Pending reviews are invisible to others and never appear. */
export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed';

/** One submitted review. */
export interface PrReview {
  /** The reviewer's GitHub login. */
  reviewer: string;
  isBot: boolean;
  state: ReviewState;
  association: AuthorAssociation;
  submittedAt: Date;
}

/** What kind of event an activity entry records. Review comments count as `comment`. */
export type ActivityKind = 'comment' | 'review' | 'commit';

/** One timestamped event on the pull request, bots included. */
export interface PrActivity {
  at: Date;
  /** The GitHub login, or the git author name when a commit has no linked account. */
  actor: string;
  isBot: boolean;
  kind: ActivityKind;
}

/**
 * One CI result: a check run's conclusion, or a commit status mapped onto the
 * same values (`error` maps to `failure`). `pending` covers queued and
 * in-progress runs. `action_required` is how the DCO app and first-time
 * contributor approvals report a run waiting on a maintainer.
 */
export type CiConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'stale'
  | 'pending';

/** One named check run or commit status on the head commit. */
export interface CiCheck {
  name: string;
  conclusion: CiConclusion;
}

/**
 * The head commit's overall CI state: `failure` when any check failed,
 * `pending` when any is still running, `none` when there are no checks.
 */
export type CiState = 'success' | 'failure' | 'pending' | 'none';

/** CI results for the head commit. */
export interface PrCi {
  state: CiState;
  checks: CiCheck[];
}

/** Another open pull request that references at least one of the same issues. */
export interface RelatedPr {
  number: number;
  title: string;
  url: string;
  /** The other pull request author's login. */
  author: string;
  createdAt: Date;
  /** Issue numbers both pull requests reference. Never empty. */
  sharedIssues: number[];
}

/** Everything the checks and the AI layer read about one pull request, fetched once. */
export interface PrSnapshot {
  repo: RepoName;
  number: number;
  title: string;
  /** The description, or an empty string when there is none. */
  body: string;
  /** The pull request's web page. */
  url: string;
  isDraft: boolean;
  author: PrAuthor;
  createdAt: Date;
  /** The branch the pull request targets, such as `main` or `dev-v3`. */
  baseRef: string;
  headSha: string;
  /** Label names. */
  labels: string[];
  mergeableState: MergeableState;
  /** Oldest first. */
  commits: PrCommit[];
  files: PrFile[];
  /** Oldest first. */
  reviews: PrReview[];
  /** Comments, reviews, and commits, oldest first. */
  activity: PrActivity[];
  ci: PrCi;
  relatedOpenPrs: RelatedPr[];
}

/** Every deterministic check, in the order reports list them. */
export const CHECK_IDS = [
  'dco',
  'conflicts',
  'ci',
  'linked-issue',
  'duplicates',
  'template',
  'tests',
  'size',
  'staleness',
] as const;

/** The identifier of one deterministic check. */
export type CheckId = (typeof CHECK_IDS)[number];

/** A check's verdict. `info` reports a fact without judging it, or that the check could not decide. */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

/** The outcome of one deterministic check. */
export interface CheckResult {
  id: CheckId;
  /** A short human name, such as `DCO`. */
  title: string;
  status: CheckStatus;
  /** One line explaining the verdict. */
  summary: string;
  /** Facts a maintainer can verify, each naming the commit, file, PR, or number behind the verdict. */
  evidence: string[];
}

/** The kind labels the AI layer can suggest. */
export type PrKind = 'bug' | 'feature' | 'docs' | 'refactor' | 'chore';

/** How sure the model says it is. */
export type Confidence = 'low' | 'medium' | 'high';

/** A yes-or-no judgment with room for doubt. */
export type Likelihood = 'yes' | 'possible' | 'no';

/** Where in the diff an AI flag is grounded. The file must be one the pull request changes. */
export interface AiEvidence {
  /** Repository-relative path of a changed file. */
  file: string;
  /** A hunk header from the file's patch, such as `@@ -10,6 +10,8 @@`. */
  hunk?: string;
  /** A line quoted from the patch, title, or body. */
  quote?: string;
}

/** The suggested kind label. */
export interface KindFlag {
  kind: PrKind;
  confidence: Confidence;
  /** One line on why. */
  reason: string;
  evidence: AiEvidence[];
}

/** Whether the change likely breaks compatibility under HIP-0004. */
export interface BreakingChangeFlag {
  verdict: Likelihood;
  confidence: Confidence;
  reason: string;
  evidence: AiEvidence[];
}

/** Whether the change likely needs a Helm Improvement Proposal. */
export interface NeedsHipFlag {
  verdict: Likelihood;
  confidence: Confidence;
  reason: string;
  evidence: AiEvidence[];
}

/** A short summary of the change and where a reviewer should look first. */
export interface SummaryFlag {
  /** At most two lines. */
  summary: string;
  /** Where to start reviewing, such as a file or function. */
  reviewFocus: string;
  evidence: AiEvidence[];
}

/** The full set of advisory flags for one pull request. */
export interface AiFlags {
  kind: KindFlag;
  breakingChange: BreakingChangeFlag;
  needsHip: NeedsHipFlag;
  summary: SummaryFlag;
}

/**
 * What the AI layer produced. `skipped` means it never ran, for example
 * because no API key is set; `failed` means it ran and gave no usable answer.
 */
export type AiOutcome =
  | { status: 'ok'; model: string; flags: AiFlags }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/** Which pull request, and which commit of it, a report describes. */
export type PrIdentity = Pick<PrSnapshot, 'repo' | 'number' | 'title' | 'url' | 'headSha'>;

/** Everything the renderers print for one pull request. */
export interface ReadinessReport {
  pr: PrIdentity;
  /** In `CHECK_IDS` order. */
  checks: CheckResult[];
  ai: AiOutcome;
}
