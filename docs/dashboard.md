# Dashboard

`helm-triage queue --format html` prints the [queue](queue.md) as one
self-contained HTML page, and a scheduled workflow publishes it to GitHub
Pages so maintainers can share a link instead of running the command. It adds
no data source: the page shows the same buckets and columns as the text and
markdown formats, but lists ready work first and drafts last, the reverse of
the precedence order, since maintainers scan it for what they can act on now.

## The page

| Part     | Content                                                                         |
| -------- | ------------------------------------------------------------------------------- |
| Masthead | The Helm logo, the repository, how many open pull requests it shows, and when   |
| Cards    | One per bucket with its count and who acts next, linking to its section         |
| Sections | One per bucket, ready first, with a one-line hint; empty says `None.`           |
| Rows     | The `QUEUE_COLUMNS`, plus `QUEUE_AI_COLUMNS` with `--ai`                        |
| Reasons  | One pill per reason, colored by its kind: failing CI, conflicts, DCO, and so on |
| Badges   | Kind, Breaking, and Needs HIP draw as colored badges; a row without flags `-`   |
| Links    | Each pull request number links to `https://github.com/<repo>/pull/<n>`          |
| Footer   | With `--ai`, the counts left without AI flags, then credit and a trademark note |

The page uses Helm's brand palette from `helm/community` (navy `#0F1689` and
its secondary, shade, and accent colors) and the Helm icon from the CNCF
artwork repository, inlined from `src/queue/helm-logo.ts`. It has inline CSS,
no JavaScript, and no external assets, and follows `prefers-color-scheme` for
light and dark. Bucket cards wrap, short columns don't wrap, and the title
column keeps a minimum width, so it stays readable on a phone.
`renderQueueHtml` in `src/queue/html.ts` builds it.

## Publishing

`docs/demo/helm-triage-dashboard.yml` is the workflow to install on the test
fork as `.github/workflows/helm-triage-dashboard.yml`. It runs hourly and on
demand, and only when the repository is `theycallmeswift/helm`.

Each run checks out this repository, sets up Node 26, renders two pages, and
deploys `site/` with `actions/upload-pages-artifact` and `actions/deploy-pages`:

| Page                        | Command                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `site/index.html`           | `queue --repo $GITHUB_REPOSITORY --format html --ai`, the fork's demo |
| `site/helm/helm/index.html` | `queue --repo helm/helm --limit 100 --newest --format html --ai`      |

Each page's masthead links to the other with `--nav`. The helm/helm page shows
only the newest 100 pull requests because the workflow's token gets 1,000 REST
requests an hour and a pull request costs about 8; 100 keeps a run near 900.
`actions/cache` keeps the AI cache across runs, so an unchanged pull request
costs no OpenRouter request.

To enable it on the fork:

1. Enable Actions on the fork (Actions tab → enable workflows); forks start
   with Actions and scheduled workflows turned off.
2. Copy the workflow into `.github/workflows/`.
3. Set Settings → Pages → Source to **GitHub Actions**.
4. Optionally add an `OPENROUTER_API_KEY` repository secret; without it the AI
   columns show `-` for pull requests not already cached.
5. Run it once from the Actions tab, or wait for the hourly schedule.

## Safety

The page is public, and pull request titles, logins, and AI text are written
by anyone, so:

- Every value is HTML-escaped (`&`, `<`, `>`, `"`, `'`) before it reaches the
  page.
- Links are built only from the repository and pull request number, never
  from pull request text.
- Badge and reason pill classes come from fixed tables keyed by typed
  values; a value outside them gets the plain style, so model output and pull
  request text never reach an attribute.
- The workflow's token only reads (`contents`, `pull-requests`, `issues`,
  `checks`, `statuses`); its only writes are `pages` and `id-token`, which the
  Pages deployment needs. It only reads `helm/helm`; it never comments on,
  labels, or otherwise writes to it.
- `--nav` accepts only relative paths and `https://` URLs, and escapes both
  the label and the target.
