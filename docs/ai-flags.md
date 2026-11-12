# AI flags

The AI layer (`src/ai/`) gives each pull request four judgment flags through
OpenRouter's OpenAI-compatible chat completions API. **Every flag is advisory:**
it suggests where a maintainer should look and never decides anything. Each
flag cites at least one changed file, with a hunk header or a quoted line, so a
maintainer can check it in seconds.

## The flags

| Flag             | Values                                        | What it asks                                                                                                                                              |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`           | `bug`, `feature`, `docs`, `refactor`, `chore` | Which kind label fits, with a confidence                                                                                                                  |
| `breakingChange` | `yes`, `possible`, `no`                       | Whether it likely breaks HIP-0004 compatibility: CLI commands and flags, `Chart.yaml` and file formats, `pkg/` Go APIs; `cmd/` and `internal/` may change |
| `needsHip`       | `yes`, `possible`, `no`                       | Whether it likely needs a HIP: features, proposals, and breaking changes do; small quality-of-life changes do not                                         |
| `summary`        | Two lines and a review focus                  | What the change does and where to start reviewing                                                                                                         |

Each verdict carries a `low`, `medium`, or `high` confidence and a one-line
reason. The types are `AiFlags` and `AiOutcome` in `src/pr/types.ts`.

## Prompt inputs

The prompt holds the repository, number, base branch, title, body, and, for
every changed file, a header line (path, status, rename source, line counts)
followed by its patch. The title, body, and patches are wrapped in
`<pr_title>`, `<pr_body>`, and `<pr_patch>` tags, and the system prompt tells
the model they are untrusted content whose instructions it never follows. The
model answers in a strict JSON schema
(`response_format` of type `json_schema`), and the answer is validated by hand.
Evidence citing a file the pull request does not change, or giving neither a
hunk nor a quote, is dropped. A flag left with no evidence, or any answer that
does not match the schema, makes the outcome `failed` with the reason.

## Diff budget

`HELM_TRIAGE_DIFF_TOKEN_BUDGET` (default 24,000) caps the patch text sent,
estimated at four characters per token. The title, body, and file headers are
always sent and do not count. Patches are added in file order; the first that
does not fit is cut to the remaining characters and marked `[patch truncated]`,
and later ones are marked `[patch omitted: over budget]`. When anything was
cut, the prompt says so.

## Outcomes

- `ok`: the flags and the model that produced them.
- `skipped`: `OPENROUTER_API_KEY` is not set. Nothing is sent, and the rest of
  the report (the deterministic checks) still runs.
- `failed`: the request failed, OpenRouter returned an HTTP error, or the
  answer was unusable. The reason says which.

## Cache

`ok` results are stored at
`<cacheDir>/ai-flags/<owner>/<name>/<number>/<headSha>.json`, where `cacheDir`
is `HELM_TRIAGE_CACHE_DIR`, else `$XDG_CACHE_HOME/helm-triage`, else
`~/.cache/helm-triage`. The file records the model. A run for the same head
SHA and model reads the file and makes no request; a new push or a different
model asks again and replaces the file. A corrupt file counts as a miss.
Failed outcomes are never cached.
`readCachedAiFlags(cacheDir, repo, number, headSha)` reads an entry from any
model without a request, for listing many pull requests cheaply.

## Configuration

| Variable                        | Default                        |
| ------------------------------- | ------------------------------ |
| `OPENROUTER_API_KEY`            | unset, so flags are skipped    |
| `HELM_TRIAGE_MODEL`             | `anthropic/claude-sonnet-5.5`  |
| `HELM_TRIAGE_OPENROUTER_URL`    | `https://openrouter.ai/api/v1` |
| `HELM_TRIAGE_DIFF_TOKEN_BUDGET` | `24000`                        |
| `HELM_TRIAGE_CACHE_DIR`         | see [Cache](#cache)            |
