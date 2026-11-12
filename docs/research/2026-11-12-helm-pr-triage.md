# Helm PR triage: research for the hackathon project

Dated snapshot, 2026-11-12 (KubeCon NA 2026). Goal: pick something buildable
in a few hours that cuts Helm maintainers' PR triage, review, and merge work.
Numbers come from read-only `gh` queries against `helm/helm`; items marked
unverified come from search snippets or general knowledge.

## TL;DR

- `helm/helm` has 252 open PRs. Median age is 70 days, p90 is 216 days.
- 67% (170) have no human review. A Copilot bot review is the de facto first
  touch. Only 26 PRs have any approval.
- Inflow outruns merges about 3:1 since October (158 opened, 51 merged). The
  merged sample is fast (median 1.1 days) but biased toward maintainers and
  dependabot; external first-time PRs wait.
- The pain is repetitive, mechanical checking: rebase, DCO, lint, duplicates,
  labels, "who can review?", plus judgment calls (HIP needed, breaking
  change, backport).
- Existing automation covers size and `v4.x` labels, stale, and CI. It does
  not cover kind labels, conflicts, linked issues, duplicates, compat, or
  backports.
- Recommended: a read-only "triage copilot" CLI/Action that ranks the open
  queue (option B) and prints a per-PR readiness report (option A), mixing
  deterministic checks with Claude-judged flags. Stretch: an API/CLI
  compatibility gate (option C).

## The problem in numbers

Source for all rows: [PR data pull](#sources) of `helm/helm`, 2026-11-12,
unless noted.

| Metric                                            | Value                                           |
| ------------------------------------------------- | ----------------------------------------------- |
| Open PRs                                          | 252 (7 drafts, 2 dependabot)                    |
| Age, median / mean / p90                          | 70.5 d / 113 d / 216 d                          |
| Age buckets                                       | <30 d: 76; 30-90 d: 77; 90-365 d: 91; >365 d: 8 |
| Zero human reviews (excl. bots, author)           | 170 (67%)                                       |
| Reviewed by Copilot bot                           | 125 (351 reviews)                               |
| Approved by at least one reviewer                 | 26 (label `Has One Approval`: 15)               |
| Has CHANGES_REQUESTED                             | 35                                              |
| `Stale` label / no human activity over 90 d       | 48 / 51 (20%)                                   |
| Merge conflicts (`dirty`) vs `needs-rebase` label | 35 (14%) vs 2                                   |
| CI failing                                        | 7 (golangci-lint 5)                             |
| DCO workflow `action_required`                    | 5 (first-timer approval pending)                |
| PRs with a commit lacking `Signed-off-by`         | 23 (9%)                                         |
| No kind label (feature, bug, docs, ...)           | 246 (98%)                                       |
| No `#N` issue reference in title or body          | 100 (40%)                                       |
| Issues with more than one open PR                 | 14 issues, 31 PRs (one has 5)                   |
| Authors with no prior association                 | 199 (79%)                                       |
| Inflow vs merges since 2026-10-01                 | 158 opened vs 51 merged (about 3:1)             |
| Merged-sample time to merge (last 100)            | median 1.1 d, p90 12.5 d                        |

Caveats:

- Merged sample bias: of the last 100 non-dependabot merges, 43 are from one
  author and most are maintainers or regulars. 73 of the last 100 merges
  overall are dependabot. The sample says nothing about external PR latency.
- `blocked` merge state (205 PRs) is a branch-protection rule, not a defect.
- Author association hides maintainers (private org membership), so 79% is
  an upper bound on true outsiders.
- Stale dates are skewed: the stale bot touches `updated_at`, so human
  activity was measured from comments, reviews, and commits.
- Heavy author batches (11, 5, 5, 5 open PRs) and agent-style titles are
  this research's inference, not a maintainer statement.

## What maintainers said

- [helm/helm#32494](https://github.com/helm/helm/issues/32494), "Non-collaborator
  PR limit" (gjenkins8, 2026-07-29, open). The maintainers "can not (don't have
  time to) actually review every contributed PR." Its goal is to reduce the
  backlog so more contributions get attention.
- Same issue, on AI: "easier contributions appears to have equated to more
  contributions." It calls for a separate AI contribution policy; none exists
  in `helm/helm`. It proposes GitHub's open-PR limit for users without write
  access, which throttles volume but does not help review what remains.
- [helm/community#420](https://github.com/helm/community/pull/420), draft HIP
  "Enhance Helm Pull Request Lifecycle Policy" (scottrigby, open since
  2025-11-06). It proposes Conventional Commits titles, exactly one type
  label, a milestone or `no-milestone` label, and `needs backport` as
  incompatible with `enhancement`. Its "Automation Opportunities" section
  lists title validation, label mutual-exclusion and milestone checks, and
  release-note generation. That is a ready-made bot spec.
- The onboarding guide warns that submitters often miss compatibility
  breaks, so reviewers should "be extra gentle"
  ([guide](https://github.com/helm/community/blob/main/helm-maintainers-onboarding-guide.md)).
- Framing: maintainers describe fairness of limited review time, not an
  anti-AI stance. A tool that spends no maintainer time on the first pass
  fits.

## The maintainer workflow today

One core maintainer is the weekly triager and should triage "at least once
per work day"
([CONTRIBUTING](https://github.com/helm/helm/blob/main/CONTRIBUTING.md#the-triager)).
Per PR, they or a reviewer check:

1. **DCO:** every commit has `Signed-off-by`. A DCO app check enforces it.
2. **Labels:** size label, kind (`bug`/`feature`), milestone, then
   `awaiting review`.
3. **Approvals:** community PRs of `size/S` or larger need 2 maintainer
   approvals; a maintainer's own PR needs 1 other.
4. **HIP:** `feature` and `proposal` changes need a HIP in `helm/community`;
   breaking changes too (HIP-0001, HIP-0012). Small QoL changes are exempt.
5. **Compatibility (HIP-0004):** CLI commands, flags, and args; `Chart.yaml`
   and other file formats; chart repo behavior; and Go APIs in `pkg/` must
   stay backward compatible. `cmd/` and `internal/` may change.
6. **Branch rules:** Helm 4 is `main`; Helm 3 is `dev-v3`. Fix on `main`
   first, then backport (`Needs v3 backport`, `needs-pick`, `dont-backport`).
   There is no backport to minor release branches.
7. **Docs and tests:** `docs needed` label (docs live in `helm/helm-www`),
   unit tests, `make test-style` (golangci-lint), template checkboxes.

Conflicting source, unverified: CONTRIBUTING.md says Helm 3 security support
ends 2026-11-11, but a helm.sh snippet seen only in search results says it was
extended to 2027-02-10. Verify at the Helm 3 EOL post before the tool relies
on either date.

## Repetitive manual tasks

Ranked by frequency in maintainer and contributor comments on open PRs
(keyword hits: rebase/conflict 21, lint 12, DCO 8, compat 5, tests 4).

1. **Rebase and conflict nudges.** E.g.
   [#31708](https://github.com/helm/helm/pull/31708#issuecomment-3814427079),
   [#12864](https://github.com/helm/helm/pull/12864#issuecomment-4696221679),
   [#32236](https://github.com/helm/helm/pull/32236#issuecomment-4756152841).
2. **Lint and CI nudges.** E.g.
   [#32594](https://github.com/helm/helm/pull/32594#issuecomment-5514816986),
   [#31847](https://github.com/helm/helm/pull/31847#issuecomment-5894706540).
3. **DCO nudges and workflow approvals for first-timers.** E.g.
   [#32558](https://github.com/helm/helm/pull/32558#issuecomment-5331612712),
   [#31615](https://github.com/helm/helm/pull/31615#issuecomment-3662076079),
   [#32282](https://github.com/helm/helm/pull/32282).
4. **Reviewer routing and "needs another maintainer".** E.g.
   [#32627](https://github.com/helm/helm/pull/32627#issuecomment-5928483298),
   [#32490](https://github.com/helm/helm/pull/32490#issuecomment-5134851665).
5. **Duplicate detection.** E.g.
   [#32483](https://github.com/helm/helm/pull/32483#issuecomment-5418337420).
6. **Wrong target branch.** E.g.
   [#32266](https://github.com/helm/helm/pull/32266#issuecomment-4971974175).
7. **Kind, area, and milestone labeling.** Mostly not done (98% unlabeled).
8. **Judgment gates:** behavior change, HIP needed, compat. E.g.
   [#31841](https://github.com/helm/helm/pull/31841#issuecomment-5920399379),
   [#32314](https://github.com/helm/helm/pull/32314#issuecomment-5744081691).
9. **Stale-bot pushback.** Contributors reply "Not stale", e.g.
   [#31908](https://github.com/helm/helm/pull/31908#issuecomment-4694019731).
10. **Squash requests** on long commit chains, e.g.
    [#31615](https://github.com/helm/helm/pull/31615#issuecomment-5588391757).

Items 1-6 and 9-10 are deterministic. Items 7-8 need judgment.

## Existing automation versus gaps

| Exists in `helm/helm`                                       | Gap (manual today)                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `label-pr.yml`: adds `v4.x` for base `main`                 | Kind, area, breaking, docs, and test labels                                                                                    |
| Size labels (external bot; mechanism not in repo workflows) | Size label vs actual change review                                                                                             |
| `stale.yaml`: 90 d + 30 d, `keep open` exemption            | Human-activity-aware staleness; dismissal of wrong stale marks                                                                 |
| DCO app check                                               | DCO fix comment; first-timer workflow approval                                                                                 |
| golangci-lint, build-test, e2e, govulncheck, codeql         | Lint-failure nudges; conflict detection (`needs-rebase` on 2 of 35)                                                            |
| Copilot PR reviewer (351 reviews)                           | Helm-specific rules (HIP, HIP-0004, backport)                                                                                  |
| dependabot (main and dev-v3, grouped)                       | Paired main/dev-v3 dependabot PRs look like duplicates                                                                         |
| PR template with checkboxes                                 | Checking boxes against the diff; linked-issue check                                                                            |
| none                                                        | Duplicate PR detection, reviewer routing, target-branch check, API diff, release-note or docs enforcement, author batch limits |

Source: workflow inventory in the PR data pull.

## Tool landscape

Marked **fetched** if a source was read this session, else **general**
(general knowledge, verify before claiming specifics).

- **Prow and Tide** (Kubernetes): ChatOps, OWNERS approvals, merge queue.
  General. Too heavy to adopt in hours; Helm's labels copy its model.
- **triage-party** (Google): rule-based queue dashboard. General; possibly
  unmaintained (unverified).
- **CodeRabbit:** AI line-level review, free for OSS; Kubernetes uses it as
  an advisory gate. Fetched via
  [InfoQ](https://www.infoq.com/news/2026/07/kubernetes-ai-policy). Knows
  nothing of HIP-0004 or the backport flow.
- **GitHub Copilot review and coding agent:** already active on Helm.
  General for the agent; the Copilot review count is from the data pull.
- **Graphite:** stacked PRs and AI review, company oriented. General.
- **Mergify:** merge queue and auto-backport rules, label/CI based. General.
  A possible off-the-shelf backport piece.
- **Probot and Actions** (DCO, size, labeler, semantic-PR-title): single
  purpose building blocks. General.
- **Dosu:** AI issue triage. General; issue-centric.
- **gh-aw (GitHub Agentic Workflows)** and Claude Code GitHub Action:
  markdown-defined agent workflows, read-only by default with safe outputs.
  Fetched via the
  [GitHub changelog](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/).
  Natural substrate, still needs Helm-specific rules.
- **GitHub native PR limits** (2026-06-17): throttle volume, do not help
  review. Fetched via the
  [GitHub changelog](https://github.blog/changelog/2026-06-17-limit-open-pull-requests-for-users-without-write-access/).
- **apidiff, gorelease, go-apidiff:** Go exported-API break detection. General;
  Helm CI does not run one (no workflow found).
- **Cobra flag diff:** no off-the-shelf tool; script it by building base and
  head. General.

## AI-generated PR trend

- A Linux Foundation Research survey (234 respondents) reports about 1 in 4
  incoming changes judged low quality or AI-generated, and burnout as the top
  concern on large projects. About 3 in 4 maintainers already use AI to vet
  submissions
  ([Help Net Security, 2026-10-26](https://helpnetsecurity.com/2026/10/26/linux-foundation-open-source-ai-slop)).
- GitHub shipped open-PR limits and bypass lists, and is adding PR archiving
  ([GitHub blog](https://github.blog/open-source/maintainers/how-pull-request-limits-are-cutting-down-the-noise/)).
- Kubernetes requires AI disclosure and keeps final review human
  ([InfoQ](https://www.infoq.com/news/2026/07/kubernetes-ai-policy)). Other
  projects gate by volume or accepted issues (curl, Ghostty, CPython; see the
  [roundup](https://codenote.net/en/posts/oss-ai-slop-contribution-policy-shift/)).
- Helm signals: agent-style PR titles and comments, `AGENTS.md` in the repo,
  and no AI policy yet ([#32494](https://github.com/helm/helm/issues/32494)).
- Few projects have solved "explain this PR to a busy maintainer and say
  what is missing." That is the opening.

## Candidate projects

Scores are 1 (low) to 5 (high); for risk, 5 is safest. Judged by this
document's author, not measured.

### A. PR readiness report (per PR)

Given a PR, print a checklist: DCO, conflicts, CI, linked issue, template
boxes vs diff, tests touched, size vs lines, docs likely needed, target
branch. Helps the reviewer who opens a PR cold.

| Impact | Buildable in ~4 h | Read-only demo | Risk |
| ------ | ----------------- | -------------- | ---- |
| 4      | 5                 | 5              | 4    |

- Deterministic: DCO trailers, mergeability, CI state, issue links, labels,
  size, test files touched, template checkboxes.
- LLM-judged: summary of the change, likely needs HIP, likely breaking,
  suggested kind label, whether checked boxes match the diff.

### B. Triager queue digest (all open PRs)

Rank all open PRs by readiness, staleness, duplicates, and author batches,
with what each needs from a maintainer. Replaces the daily triage scan.

| Impact | Buildable in ~4 h | Read-only demo | Risk |
| ------ | ----------------- | -------------- | ---- |
| 5      | 4                 | 5              | 4    |

- Deterministic: age, last human activity, conflicts, CI, review state,
  shared-issue duplicate clusters, per-author open counts.
- LLM-judged: semantic duplicate detection, one-line "what this needs next".

### C. API and CLI compatibility gate

Build base and head; run `apidiff` on `pkg/` and diff cobra flags and
commands. Flags breaking changes per HIP-0004.

| Impact | Buildable in ~4 h | Read-only demo | Risk |
| ------ | ----------------- | -------------- | ---- |
| 4      | 2                 | 3              | 3    |

- Deterministic: the diffs themselves.
- LLM-judged: explaining the break and whether it is behavioral.
- Risk: needs building Helm per PR; slow, and Go toolchain setup on a demo
  machine.

### D. Backport assistant

For approved bug fixes on `main`, test whether the cherry-pick applies to
`dev-v3` or a release branch, and suggest `Needs v3 backport`.

| Impact | Buildable in ~4 h | Read-only demo | Risk |
| ------ | ----------------- | -------------- | ---- |
| 2      | 3                 | 2              | 3    |

- Deterministic: labels, clean-apply check.
- LLM-judged: is it a bug fix or security fix.
- Risk: Helm 3 is nearly out of support, with unverified dates; few PRs
  qualify, and a demo needs write access.

### E. Batch and low-effort PR heuristics

Flag author batches, untouched templates, no linked issue, no tests, and
agent-style text, as suggested actions only.

| Impact | Buildable in ~4 h | Read-only demo | Risk |
| ------ | ----------------- | -------------- | ---- |
| 3      | 4                 | 4              | 2    |

- Deterministic: counts, template diffs, test presence, issue links.
- LLM-judged: "looks agent-generated".
- Risk: accusing a contributor wrongly. Keep to neutral, evidence-based
  flags. Maintainers have not asked for detection ([#32494](https://github.com/helm/helm/issues/32494)
  proposes limits instead).

## Recommendation

Build **B + A** as a read-only "triage copilot" CLI, optionally wrapped in a
GitHub Action. B is the front door (a ranked queue); A is the drill-down for
any PR in it. Treat E's batch and duplicate signals as columns inside B, not
a separate product.

- **Deterministic layer:** DCO, conflicts, CI, linked issue, duplicates by
  shared issue and files, labels, staleness by human activity, template
  checkboxes. These are fast, testable, and explainable.
- **Claude-judged flags:** likely needs a HIP, likely breaking change,
  suggested kind label, likely duplicate. Each flag shows its evidence and is
  advisory.
- **Output:** a ranked queue plus a per-PR readiness report.
- **Demo:** run read-only against real `helm/helm` PRs (e.g. the duplicate
  cluster on issue #31924, #32887, #32854). Never post to `helm/helm`.
- **Stretch:** C, scoped to one demo PR, if the core lands early.

Open questions for the team:

1. Output surface: CLI text, an Action comment, or a static dashboard?
2. Read-only for the demo, or also post comments on a fork?
3. Scope of LLM use: which flags, and how much diff context per PR?
4. Evaluation: how do we check flags are right (hand-label 20 PRs, compare to
   maintainer comments)?
5. Should we ask a maintainer which checks matter most before building?

## Sources

- PR data pull: read-only `gh` analysis of `helm/helm`, 2026-11-12 (scripts
  and JSON kept in the session scratchpad, not in this repo).
- [helm/helm#32494](https://github.com/helm/helm/issues/32494), PR limit
  proposal.
- [helm/community#420](https://github.com/helm/community/pull/420), draft PR
  lifecycle HIP.
- [CONTRIBUTING.md](https://github.com/helm/helm/blob/main/CONTRIBUTING.md)
- [Maintainers onboarding guide](https://github.com/helm/community/blob/main/helm-maintainers-onboarding-guide.md)
- [Helm 3 end of life](https://helm.sh/blog/helm-v3-end-of-life) (dates
  unverified)
- [Helm 4 release](https://helm.sh/blog/helm-4-released)
- [GitHub: agentic workflows preview](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/)
- [GitHub: open PR limits](https://github.blog/changelog/2026-06-17-limit-open-pull-requests-for-users-without-write-access/)
- [GitHub: PR limits cut noise](https://github.blog/open-source/maintainers/how-pull-request-limits-are-cutting-down-the-noise/)
- [Help Net Security: LF survey](https://helpnetsecurity.com/2026/10/26/linux-foundation-open-source-ai-slop)
- [InfoQ: Kubernetes AI policy](https://www.infoq.com/news/2026/07/kubernetes-ai-policy)
- [AI slop policy roundup](https://codenote.net/en/posts/oss-ai-slop-contribution-policy-shift/)
