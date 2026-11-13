# helm-triage

A triage copilot for [Helm](https://github.com/helm/helm) maintainers, built
at the Helm hackathon at KubeCon NA 2026.

`helm/helm` has 252 open pull requests, and 67% of them have no human review.
Most of a triager's time goes to mechanical checks: rebase, DCO sign-off,
failing lint, duplicate PRs, missing labels. The rest goes to judgment calls:
whether a change is breaking and whether it needs a HIP. `helm-triage` does the
mechanical checks, drafts the judgment calls with evidence, and leaves every
decision to a maintainer.

Status: MVP. `helm-triage pr`, `helm-triage queue`, and the GitHub Action
work.

## What it does

`helm-triage pr <n> [--repo owner/name] [--format text|md]` prints a readiness
report for one pull request. `--repo` defaults to `GITHUB_REPOSITORY`, then
`helm/helm`; `--format md` prints the comment the Action posts. It exits 0
whenever a report prints, even when checks fail. This run is against a
recorded fixture with no `OPENROUTER_API_KEY`:

```text
$ helm-triage pr 14 --repo theycallmeswift/helm
theycallmeswift/helm#14 urlutil: keep trailing slash when joining URLs (ff038f8)
  DCO ❌  Conflicts ✅  CI ❌  Linked issue ✅  Duplicates ⚠️  Template ✅  Tests ✅  Size ℹ️  Staleness ✅
  ❌ DCO: 1 of 1 commits lack a Signed-off-by trailer.
    - ff038f8: no Signed-off-by trailer
  ❌ CI: CI failed: build.
    - build: failure
  ⚠️ Duplicates: 1 other open pull requests close the same issue.
    - #13 by theycallmeswift, opened 2026-11-12, also closes #10: https://github.com/theycallmeswift/helm/pull/13
  🤖 AI flags skipped: AI flags skipped because OPENROUTER_API_KEY is not set; set it to an OpenRouter API key to enable them
```

- **Deterministic checks:** DCO, merge conflicts, CI status, linked issue,
  duplicate PRs on the same issue, PR template checkboxes, tests touched, size,
  and staleness measured by human activity.
- **AI flags:** suggested kind label, likely breaking change under HIP-0004
  (CLI flags, `Chart.yaml`, `pkg/` Go APIs), likely needs a HIP, and a short
  summary with where to look first. Every flag cites its evidence and is
  advisory.
- **GitHub Action:** runs `helm-triage pr <n> --format md` on each pull request
  and keeps one up-to-date readiness comment. See
  [docs/github-action.md](docs/github-action.md).
- **Queue:** `helm-triage queue` sorts every open PR into a bucket by who
  must act next: ready for review, needs 2nd approval, needs author,
  duplicate, stale, or draft. See [docs/queue.md](docs/queue.md).

It never posts to `helm/helm`, and it never labels, closes, or merges anything.

## How it works

- GitHub data comes from the REST API with `GITHUB_TOKEN` (locally,
  `gh auth token`).
- AI flags call [OpenRouter](https://openrouter.ai)'s OpenAI-compatible API
  with JSON-schema output. Set `OPENROUTER_API_KEY`, and optionally a model
  override. Without a key, only the deterministic checks run.
- AI results are cached on disk by the PR's head SHA, so a re-run is instant
  and free.

## Development

```sh
npm ci
npm test
npm run lint
GITHUB_TOKEN=$(gh auth token) node src/index.ts pr 14 --repo theycallmeswift/helm
```

## Docs

- [AGENTS.md](AGENTS.md): agent context and conventions.
- [docs/research/2026-11-12-helm-pr-triage.md](docs/research/2026-11-12-helm-pr-triage.md):
  PR backlog research, candidate projects, and why this one.
- [docs/checks.md](docs/checks.md): the deterministic readiness checks.
- [docs/ai-flags.md](docs/ai-flags.md): the advisory AI flags.
- [docs/queue.md](docs/queue.md): the open pull request queue and its buckets.
- [docs/dashboard.md](docs/dashboard.md): the queue as a Pages dashboard.
- [docs/github-action.md](docs/github-action.md): running the readiness
  comment Action.
- [docs/style/](docs/style/): how code, tests, and docs are written.
- [docs/cloud-agents.md](docs/cloud-agents.md): cloud agent setup.
