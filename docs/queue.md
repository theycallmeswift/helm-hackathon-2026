# Queue

`helm-triage queue [--repo owner/name] [--format text|md] [--limit N]` sorts
every open pull request into one bucket by who must act next, so a triager
works down a list instead of opening every pull request. It only reads from
GitHub.

- `--repo` defaults to `GITHUB_REPOSITORY`, then `helm/helm`.
- `--format md` prints a markdown table per bucket; the default is plain text.
- `--limit N` queues only the N oldest opened pull requests, for quick runs
  and demos.

It lists open pull requests oldest opened first, fetches each one's snapshot
with at most 5 in flight, since one snapshot costs several REST requests, and
runs the [readiness checks](checks.md) on it.

## Buckets

A pull request lands in the first bucket whose rule matches, in this order,
and its row shows the reason.

| Bucket             | Rule                                                                                                                     | Reason shown                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Draft              | Marked as draft                                                                                                          | `marked as draft`                     |
| Duplicate          | The `duplicates` check warns and a related pull request was opened earlier; the earliest in a cluster is not a duplicate | The earliest earlier pull request     |
| Stale              | The `staleness` check fails                                                                                              | The check's summary                   |
| Needs author       | The `dco`, `conflicts`, or `ci` check fails, or a reviewer's latest verdict requests changes                             | Every blocker found                   |
| Needs 2nd approval | Exactly one owner, member, or collaborator's latest verdict is an approval                                               | The approver                          |
| Ready for review   | Everything else, including pull requests with two or more approvals                                                      | The approvers, or `no blockers found` |

A reviewer's latest verdict is their latest approval, change request, or
dismissal; comment-only reviews leave it standing, and a dismissal clears it.

## Ordering

| Order          | Rule                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| Buckets        | The precedence order above, empty buckets included with a count of 0                    |
| Within buckets | Oldest waiting first: waiting since is the later of creation and the head commit's date |
| Ties           | Lower pull request number first                                                         |

## Output

Each bucket prints its title and count, then one row per pull request with
these columns, defined once in `QUEUE_COLUMNS` in `src/queue/render.ts`:

| Column        | Value                                   |
| ------------- | --------------------------------------- |
| PR            | `#` and the number                      |
| Title         | The pull request title                  |
| Author        | The author's login                      |
| Age           | Whole days since it was opened, as `Nd` |
| Waiting since | The waiting-since date, as `YYYY-MM-DD` |
| Reason        | Why it is in its bucket                 |
