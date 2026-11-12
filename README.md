# helm-triage

A triage copilot for [Helm](https://github.com/helm/helm) maintainers, built
at the Helm hackathon at KubeCon NA 2026.

`helm/helm` has 252 open pull requests, and 67% of them have no human review.
Most of a triager's time goes to mechanical checks: rebase, DCO sign-off,
failing lint, duplicate PRs, missing labels. The rest goes to judgment calls:
whether a change is breaking and whether it needs a HIP. `helm-triage` does the
mechanical checks, drafts the judgment calls with evidence, and leaves every
decision to a maintainer.

Status: in development. The commands below describe the planned interface.

## What it does

`helm-triage pr <n>` prints a readiness report for one pull request:

```text
$ helm-triage pr 32887
  DCO ✓  CI ✓  conflicts ✓  linked issue #32880 ✓  tests ✓
  🤖 kind: bug (high)
  🤖 breaking change: possible, changes a pkg/action flag default
  🤖 needs HIP: no
  🤖 summary: fixes nil deref in lint when values file is empty
  🤖 review focus: pkg/lint/rules/values.go
```

- **Deterministic checks:** DCO, merge conflicts, CI status, linked issue,
  duplicate PRs on the same issue, PR template checkboxes, tests touched, size,
  and staleness measured by human activity.
- **AI flags:** suggested kind label, likely breaking change under HIP-0004
  (CLI flags, `Chart.yaml`, `pkg/` Go APIs), likely needs a HIP, and a short
  summary with where to look first. Every flag cites its evidence and is
  advisory.
- **GitHub Action:** runs `helm-triage pr <n> --format md` on each pull request
  and keeps one up-to-date readiness comment. It is demoed on a fork of
  `helm/helm`.
- **Queue (stretch goal):** `helm-triage queue` sorts every open PR into a
  bucket by who must act next: ready for review, needs 2nd approval, needs
  author, duplicate, stale, or draft.

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
```

## Docs

- [AGENTS.md](AGENTS.md): agent context and conventions.
- [docs/research/2026-11-12-helm-pr-triage.md](docs/research/2026-11-12-helm-pr-triage.md):
  PR backlog research, candidate projects, and why this one.
- [docs/style/](docs/style/): how code, tests, and docs are written.
- [docs/cloud-agents.md](docs/cloud-agents.md): cloud agent setup.
