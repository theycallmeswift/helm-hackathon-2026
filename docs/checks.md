# Readiness checks

`runChecks(snapshot, options)` in `src/checks/run.ts` runs every
deterministic check over one `PrSnapshot` and returns a `CheckResult` per
check, in `CHECK_IDS` order. The checks are pure: they read only the
snapshot and `options`, never the network, the filesystem, or the clock.
`options.now` is the instant staleness is measured to, and
`options.thresholds` overrides any of `DEFAULT_THRESHOLDS` in
`src/checks/context.ts`.

Every result carries evidence strings naming the commit, file, pull request,
or number behind its verdict.

| Id             | Rule                                                                                                                                    | Pass                                        | Warn                                               | Fail                                                                                                | Info                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `dco`          | Every non-merge commit has a `Signed-off-by:` trailer                                                                                   | All signed off as the commit's author email | A sign-off names a different email than the author | A commit has no sign-off                                                                            | Every commit is a merge commit                      |
| `conflicts`    | GitHub's `mergeable_state`                                                                                                              | Any other state, including `blocked`        |                                                    | `dirty`                                                                                             | `unknown`                                           |
| `ci`           | The head commit's `ci.state`                                                                                                            | `success`                                   |                                                    | `failure`, naming each failing check, or listing every check when none reports a failing conclusion | `pending` (including DCO awaiting approval), `none` |
| `linked-issue` | `referencedIssues`: every `#N` in the title and body                                                                                    | At least one issue                          | None                                               |                                                                                                     |                                                     |
| `duplicates`   | `relatedOpenPrs`, matched on `closingIssues`                                                                                            | No other open PR closes the same issue      | Another open PR closes the same issue              |                                                                                                     | No closing keyword reference                        |
| `template`     | The text under `**What this PR does / why we need it**:`, up to the next `**…**:` heading or the end; checkbox counts are evidence only | The section has text                        | An empty body, or the section is missing or empty  |                                                                                                     |                                                     |
| `tests`        | A changed path ends in `_test.go` or sits under a `test` or `testdata` directory                                                        | A test file changed                         | A `.go` file changed with no test file             |                                                                                                     | No `.go` file changed                               |
| `size`         | Additions plus deletions across all files                                                                                               |                                             | At or above `largeSizeLines` (500)                 |                                                                                                     | Small below `mediumSizeLines` (100), else medium    |
| `staleness`    | Whole days since the latest non-bot `activity`, or since `createdAt` when only bots acted                                               | Below `staleWarnDays` (30)                  | At or above `staleWarnDays` (30)                   | At or above `staleFailDays` (90)                                                                    |                                                     |

## Issue references

The fetcher reads two lists of issue numbers from the title and body, both
ignoring code, HTML comments, and `<details>` and `<blockquote>` blocks, where
bots such as dependabot quote upstream release notes:

- `referencedIssues` holds every same-repository `#N`, such as `refs #10` or
  `(#10)`. The `linked-issue` check reads it.
- `closingIssues` holds only references after one of GitHub's closing
  keywords: `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`,
  `resolves`, or `resolved`, in any case, with an optional colon. Each number
  needs its own keyword, so `Fixes #1, #2` closes only #1. The `duplicates`
  check reads it, so a pull request that mentions another issue as prior art
  is not matched to every pull request that mentions it too.
