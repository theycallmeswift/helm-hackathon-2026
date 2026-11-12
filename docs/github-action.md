# GitHub Action

`action.yml` at the repository root is a composite Action that runs
`helm-triage pr <n> --format md` on a pull request and keeps exactly one
readiness comment on it up to date. The comment starts with a hidden marker
(`READINESS_MARKER` in `src/report/markdown.ts`); each run lists the pull
request's comments, updates the one carrying the marker, and creates it only
when none does.

The Action writes that one comment and nothing else: it never labels, closes,
or merges. The poster in `src/action/comment.ts` refuses `helm/helm` in code
and fails with an error naming the rule before making any request.

## Inputs

| Input                | Required | Default                       | Purpose                                                   |
| -------------------- | -------- | ----------------------------- | --------------------------------------------------------- |
| `pr-number`          | no       | the `pull_request` event's PR | Pull request to report on; set it for `workflow_dispatch` |
| `github-token`       | yes      |                               | Reads the pull request and writes the comment             |
| `openrouter-api-key` | no       | empty                         | Enables the advisory AI flags; empty skips them           |
| `model`              | no       | the tool's default model      | OpenRouter model id for the AI flags                      |

## Usage

```yaml
name: Readiness

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, edited]
  workflow_dispatch:
    inputs:
      pr-number:
        description: Pull request number
        required: true

permissions:
  contents: read
  pull-requests: write

jobs:
  readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: theycallmeswift/helm-hackathon-2026@main
        with:
          pr-number: ${{ inputs.pr-number || github.event.pull_request.number }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

## Permissions and forks

The job needs `contents: read` and `pull-requests: write`. On a
`pull_request` event from a fork, GitHub gives the workflow a read-only token
and no secrets, so the report renders without AI flags and posting the comment
fails. Run it on pull requests from branches in the same repository, or by
`workflow_dispatch`.

## Steps

1. Sets up Node 26; the tool has no runtime dependencies, so nothing is
   installed.
2. Runs `node src/index.ts pr <n> --repo $GITHUB_REPOSITORY --format md` into
   a file under `$RUNNER_TEMP`. Failing checks still produce a report; only an
   error such as an unreachable API fails the step.
3. Runs `node src/action/post.ts <file>`, which upserts the comment through
   the REST API at `github.api_url`.
