# Demo on the test fork

The demo runs the readiness Action on
[theycallmeswift/helm](https://github.com/theycallmeswift/helm), the fork that
holds the synthetic PRs (S1 to S10) and replayed upstream PRs (R1 to R3). The
answer key is
[test/fixtures/synthetic-prs.json](../test/fixtures/synthetic-prs.json).

Every step runs on the fork. Nothing here posts to, labels, closes, or merges
anything on `helm/helm`, and the workflow's job runs only when the repository
is `theycallmeswift/helm`.

## Runbook

1. Copy [demo/helm-triage-workflow.yml](demo/helm-triage-workflow.yml) to the
   fork's default branch as `.github/workflows/helm-triage.yml`. It uses the
   Action at `theycallmeswift/helm-hackathon-2026@main`, so that ref must
   contain `action.yml`.
2. In the fork's Settings, Secrets and variables, Actions, confirm the
   `OPENROUTER_API_KEY` repository secret exists. Without it the AI flags are
   skipped.
3. Run the workflow once per PR in the table below. The PRs were opened before
   the workflow existed, so use Actions, helm-triage, Run workflow, with the
   PR number as `pr-number`. From a shell with the GitHub CLI:

   ```bash
   for pr in 1 2 3 4 5 6 7 8 9 13 14 15 16; do
     gh workflow run helm-triage.yml --repo theycallmeswift/helm -f pr-number="$pr"
   done
   ```

4. Check each PR has exactly one readiness comment. Re-run the workflow on one
   PR and confirm the comment is edited in place, not duplicated.
5. Compare each comment with its row's expected flags, then fill in the
   comment link and the match column.
6. File each mismatch as an issue in this repository and link it from the
   match column. Don't edit the answer key to make a row match.
7. Confirm the fork's Actions tab shows no run that targeted `helm/helm`.

## Results

Expected flags list the answer key's non-null fields that differ from a
clean PR: DCO signed, no conflict, not a draft, PR template edited, no tests
touched, not breaking, no HIP needed. `AI` is the expected `ai_kind`.

| ID  | PR                                                     | Expected flags                                                  | Comment                                                                            | Match                                                                                                             |
| --- | ------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| S9  | [#1](https://github.com/theycallmeswift/helm/pull/1)   | AI docs                                                         | [comment](https://github.com/theycallmeswift/helm/pull/1#issuecomment-6837485887)  | ✅ match                                                                                                          |
| S10 | [#2](https://github.com/theycallmeswift/helm/pull/2)   | draft; AI bug                                                   | [comment](https://github.com/theycallmeswift/helm/pull/2#issuecomment-6837488445)  | ❌ draft not shown ([#21](https://github.com/theycallmeswift/helm-hackathon-2026/issues/21)); ⚠️ AI kind refactor |
| S5  | [#3](https://github.com/theycallmeswift/helm/pull/3)   | conflict; AI bug                                                | [comment](https://github.com/theycallmeswift/helm/pull/3#issuecomment-6837487575)  | ✅ checks; ⚠️ AI breaking possible                                                                                |
| S6  | [#4](https://github.com/theycallmeswift/helm/pull/4)   | AI feature, breaking, needs HIP                                 | [comment](https://github.com/theycallmeswift/helm/pull/4#issuecomment-6837491086)  | ✅ checks; ⚠️ AI needs HIP possible                                                                               |
| S7  | [#5](https://github.com/theycallmeswift/helm/pull/5)   | template untouched; AI feature, needs HIP                       | [comment](https://github.com/theycallmeswift/helm/pull/5#issuecomment-6837490787)  | ✅ checks; ⚠️ AI needs HIP possible                                                                               |
| S8  | [#6](https://github.com/theycallmeswift/helm/pull/6)   | CI failing; AI bug                                              | [comment](https://github.com/theycallmeswift/helm/pull/6#issuecomment-6837492035)  | ✅ checks; ⚠️ AI breaking possible                                                                                |
| R1  | [#7](https://github.com/theycallmeswift/helm/pull/7)   | tests touched; AI bug                                           | [comment](https://github.com/theycallmeswift/helm/pull/7#issuecomment-6837493542)  | ✅ checks; ⚠️ AI breaking possible                                                                                |
| R2  | [#8](https://github.com/theycallmeswift/helm/pull/8)   | tests touched; AI chore                                         | [comment](https://github.com/theycallmeswift/helm/pull/8#issuecomment-6837494934)  | ✅ checks; ⚠️ AI breaking possible                                                                                |
| R3  | [#9](https://github.com/theycallmeswift/helm/pull/9)   | template untouched; AI bug                                      | [comment](https://github.com/theycallmeswift/helm/pull/9#issuecomment-6837495571)  | ✅ checks; ⚠️ AI kind feature, needs HIP possible                                                                 |
| S1  | [#13](https://github.com/theycallmeswift/helm/pull/13) | links #10; tests touched; AI bug                                | [comment](https://github.com/theycallmeswift/helm/pull/13#issuecomment-6837495408) | ✅ match                                                                                                          |
| S2  | [#14](https://github.com/theycallmeswift/helm/pull/14) | DCO missing; links #10; duplicate of #13; tests touched; AI bug | [comment](https://github.com/theycallmeswift/helm/pull/14#issuecomment-6837467852) | ✅ match                                                                                                          |
| S3  | [#15](https://github.com/theycallmeswift/helm/pull/15) | links #11; tests touched; AI bug                                | [comment](https://github.com/theycallmeswift/helm/pull/15#issuecomment-6837497980) | ✅ match                                                                                                          |
| S4  | [#16](https://github.com/theycallmeswift/helm/pull/16) | links #11; duplicate of #15; AI bug                             | [comment](https://github.com/theycallmeswift/helm/pull/16#issuecomment-6837496533) | ✅ match                                                                                                          |

Run on 2026-11-12 with `anthropic/claude-sonnet-5.5`. All 13 PRs have exactly one
readiness comment, a re-run on #14 edited it in place, and all 14 workflow
runs targeted `theycallmeswift/helm` only.

- Every deterministic check matches the answer key except draft, which the
  comment does not report yet.
- ⚠️ rows are advisory AI disagreements, mostly hedged `possible` answers
  where the key says yes or no. On #2 the diff is a pure refactor, so the
  key's `bug` is arguably wrong; #9 adds a hash option, so `feature` is
  defensible.
