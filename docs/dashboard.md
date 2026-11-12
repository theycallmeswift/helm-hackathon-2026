# Dashboard

`helm-triage queue --format html` prints the [queue](queue.md) as one
self-contained HTML page, and a scheduled workflow publishes it to GitHub
Pages so maintainers can share a link instead of running the command. It adds
no data source: the page shows the same buckets, order, and columns as the
text and markdown formats.

## The page

| Part     | Content                                                                |
| -------- | ---------------------------------------------------------------------- |
| Header   | The repository, the generation time, and each bucket's count           |
| Sections | One per bucket, in precedence order; an empty bucket says `None.`      |
| Rows     | The `QUEUE_COLUMNS`, plus `QUEUE_AI_COLUMNS` with `--ai`               |
| Links    | Each pull request number links to `https://github.com/<repo>/pull/<n>` |
| Footer   | With `--ai`, the counts of pull requests left without AI flags, if any |

The page has inline CSS, no JavaScript, and no external assets, and follows
`prefers-color-scheme` for light and dark. `renderQueueHtml` in
`src/queue/html.ts` builds it.

## Publishing

`docs/demo/helm-triage-dashboard.yml` is the workflow to install on the test
fork as `.github/workflows/helm-triage-dashboard.yml`. It runs hourly and on
demand, and only when the repository is `theycallmeswift/helm`.

Each run checks out this repository, sets up Node 26, renders
`node src/index.ts queue --repo $GITHUB_REPOSITORY --format html --ai` into
`site/index.html`, and deploys `site/` with `actions/upload-pages-artifact` and
`actions/deploy-pages`. `actions/cache` keeps the AI cache across runs, so an
unchanged pull request costs no OpenRouter request.

To enable it on the fork:

1. Copy the workflow into `.github/workflows/`.
2. Set Settings → Pages → Source to **GitHub Actions**.
3. Optionally add an `OPENROUTER_API_KEY` repository secret; without it the AI
   columns show `-` for pull requests not already cached.
4. Run it once from the Actions tab, or wait for the hourly schedule.

## Safety

The page is public, and pull request titles, logins, and AI text are written
by anyone, so:

- Every value is HTML-escaped (`&`, `<`, `>`, `"`, `'`) before it reaches the
  page.
- Links are built only from the repository and pull request number, never
  from pull request text.
- The workflow's token only reads (`contents`, `pull-requests`, `issues`,
  `checks`, `statuses`); its only writes are `pages` and `id-token`, which the
  Pages deployment needs. It never comments, labels, or touches `helm/helm`.
