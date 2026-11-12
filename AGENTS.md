# Helm hackathon 2026

A KubeCon Nov 2026 hackathon project for Helm (github.com/helm/helm)
maintainers, who face an influx of pull requests. The goal is a tool that
automates tedious triage and code-review tasks so maintainers spend less time
per PR and ship faster. It is TypeScript on Node 26; the exact product is not
chosen yet, so the code is unsettled.

## Autonomy

- **Freely reversible: just do it.** Edits, local commands, scratch files,
  branches.
- **Consequential: state intent, then proceed.** Pushing a branch, opening a
  PR, adding a dependency.
- **Irreversible: always confirm first.** Force-pushing a shared branch,
  deleting branches or data, anything posted outside the repo.

## Decision principles

- **Propose, then confirm.** For design choices, present 2–3 options with a
  recommendation before writing code.
- **Action over asking.** Exhaust reversible options (read the code, run a
  small experiment) before asking.
- **Simple over clever.** Question whether a concept needs to exist before
  adding one.
- **Concise over verbose.** Lead with the point; cut preamble.

## Conventions

- Ask one question at a time.
- Follow existing patterns in the file you're touching.
- Use conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Before claiming work is done, run `npm test` and `npm run lint` and show the output.
- Keep `docs/` current: read the relevant doc before changing architecture,
  and update it in the same PR.

## Environment

- Needs Node 26; run `npm ci` when the lockfile changes.
- `npm run lint` runs markdownlint through `npx`, so it also needs Node.
- `npm test` needs no credentials. Cloud setup: `docs/cloud-agents.md`.

## Landing changes

- Open every PR as a draft from `.github/pull_request_template.md`. Mark it
  ready yourself once every Ready gate row has evidence. If CI fails after
  that, convert it back to a draft, fix it, and mark it ready again.
- The PR body carries no process narrative and no line-number citations.
- Every PR lands on `main` as one squash commit, through GitHub's merge only.
  Never push to or rewrite `main`. Update a branch by rebase, or by merging
  `main` into it; the squash keeps history linear.

## Project structure

- `docs/*.md`: undated guides, one per feature or setup, indexed in
  `README.md`.
- `docs/specs/`, `docs/research/`: dated `YYYY-MM-DD-<slug>.md` files, created
  with the first one.
- `docs/style/`: how code, tests, and docs are written.
- `.claude/`, `.github/`: agent settings and hooks; the PR template and CI.
- `tmp/`: scratch space, git-ignored.

## References

Load on demand, not at session start.

- `docs/style/development.md`: code style. Read before changing source, tests,
  or docs, then the guide it names.
- `docs/cloud-agents.md`: cloud agent setup.
- `README.md`: human-facing overview.
