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

| Id             | Rule                                                                                      | Pass                                        | Warn                                               | Fail                             | Info                                                |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `dco`          | Every non-merge commit has a `Signed-off-by:` trailer                                     | All signed off as the commit's author email | A sign-off names a different email than the author | A commit has no sign-off         | No non-merge commits                                |
| `conflicts`    | GitHub's `mergeable_state`                                                                | Any other state, including `blocked`        |                                                    | `dirty`                          | `unknown`                                           |
| `ci`           | The head commit's `ci.state`                                                              | `success`                                   |                                                    | `failure`, naming each check     | `pending` (including DCO awaiting approval), `none` |
| `linked-issue` | `linkedIssues`, which the fetcher fills from the title and body                           | At least one issue                          | None                                               |                                  |                                                     |
| `duplicates`   | `relatedOpenPrs`                                                                          | None share a linked issue                   | Another open PR shares an issue                    |                                  | No linked issue to compare                          |
| `template`     | Counts `- [ ]` and `- [x]` lines in the body                                              | Some box checked, or no boxes               | Boxes present and none checked, or an empty body   |                                  |                                                     |
| `tests`        | A changed path ends in `_test.go` or sits under a `test` or `testdata` directory          | A test file changed                         | A `.go` file changed with no test file             |                                  | No `.go` file changed                               |
| `size`         | Additions plus deletions across all files                                                 |                                             | At or above `largeSizeLines` (500)                 |                                  | Small below `mediumSizeLines` (100), else medium    |
| `staleness`    | Whole days since the latest non-bot `activity`, or since `createdAt` when only bots acted | Below `staleWarnDays` (30)                  | At or above `staleWarnDays` (30)                   | At or above `staleFailDays` (90) |                                                     |
