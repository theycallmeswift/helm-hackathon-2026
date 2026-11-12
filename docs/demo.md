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

| ID  | PR                                                     | Expected flags                                                  | Comment | Match |
| --- | ------------------------------------------------------ | --------------------------------------------------------------- | ------- | ----- |
| S9  | [#1](https://github.com/theycallmeswift/helm/pull/1)   | AI docs                                                         |         |       |
| S10 | [#2](https://github.com/theycallmeswift/helm/pull/2)   | draft; AI bug                                                   |         |       |
| S5  | [#3](https://github.com/theycallmeswift/helm/pull/3)   | conflict; AI bug                                                |         |       |
| S6  | [#4](https://github.com/theycallmeswift/helm/pull/4)   | AI feature, breaking, needs HIP                                 |         |       |
| S7  | [#5](https://github.com/theycallmeswift/helm/pull/5)   | template untouched; AI feature, needs HIP                       |         |       |
| S8  | [#6](https://github.com/theycallmeswift/helm/pull/6)   | CI failing; AI bug                                              |         |       |
| R1  | [#7](https://github.com/theycallmeswift/helm/pull/7)   | tests touched; AI bug                                           |         |       |
| R2  | [#8](https://github.com/theycallmeswift/helm/pull/8)   | tests touched; AI chore                                         |         |       |
| R3  | [#9](https://github.com/theycallmeswift/helm/pull/9)   | template untouched; AI bug                                      |         |       |
| S1  | [#13](https://github.com/theycallmeswift/helm/pull/13) | links #10; tests touched; AI bug                                |         |       |
| S2  | [#14](https://github.com/theycallmeswift/helm/pull/14) | DCO missing; links #10; duplicate of #13; tests touched; AI bug |         |       |
| S3  | [#15](https://github.com/theycallmeswift/helm/pull/15) | links #11; tests touched; AI bug                                |         |       |
| S4  | [#16](https://github.com/theycallmeswift/helm/pull/16) | links #11; duplicate of #15; AI bug                             |         |       |
