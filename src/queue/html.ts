/**
 * Renders the queue as one self-contained HTML page for the public
 * dashboard, in Helm's brand colors: inline CSS and an inline logo, no
 * JavaScript, no external assets. Pull request text is untrusted, so every
 * value is escaped, links are built only from the repository and pull request
 * number, and badge classes come from a fixed table, never from cell text.
 */

import type { RepoName } from '../pr/types.ts';
import {
  BUCKET_TITLES,
  type BucketId,
  type BucketReason,
  type BucketReasonKind,
} from './buckets.ts';
import type { QueueEntry, QueueSection } from './build.ts';
import { HELM_LOGO_SVG } from './helm-logo.ts';
import { QUEUE_COLUMNS, type QueueBadge, type QueueColumn } from './render.ts';

/** What the page shows besides the sections. */
export interface QueueHtmlOptions {
  repo: RepoName;
  /** When the queue was built; shown as the generation time and used for ages. */
  now: Date;
  columns?: QueueColumn[];
  /** Lines shown under the tables, such as how many pull requests lack AI flags. */
  notes?: string[];
  /** Links to other queue pages, shown in the masthead. */
  nav?: QueueNavLink[];
}

/** A masthead link to another queue page; the caller vets `href`. */
export interface QueueNavLink {
  label: string;
  href: string;
}

/** Where the footer credits the tool that built the page. */
const TOOL_URL = 'https://github.com/theycallmeswift/helm-hackathon-2026';

/** Characters with meaning in HTML text or attribute values, and their entities. */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Where each bucket sits on the page: ready work first, drafts last. This is
 * the reverse of the precedence the bucket rules apply, since a maintainer
 * scans the page for what they can act on now.
 */
const DASHBOARD_POSITION: Record<BucketId, number> = {
  ready: 0,
  'needs-second-approval': 1,
  'needs-author': 2,
  stale: 3,
  duplicate: 4,
  draft: 5,
};

/** What each bucket means for whoever acts next, shown on its card and under its heading. */
const BUCKET_HINTS: Record<BucketId, string> = {
  draft: 'The author marked it as not ready.',
  duplicate: 'An earlier open PR links the same issue.',
  stale: 'No recent activity; nudge or close.',
  'needs-author': 'Waiting on the author to fix a blocker.',
  'needs-second-approval': 'One maintainer approved; needs another.',
  ready: 'No blockers found; ready for review.',
};

/** The stylesheet class for each badge value; anything else gets the plain badge. */
const BADGE_CLASSES: Record<QueueBadge, string> = {
  bug: 'badge-bug',
  feature: 'badge-feature',
  docs: 'badge-docs',
  refactor: 'badge-refactor',
  chore: 'badge-chore',
  yes: 'badge-yes',
  possible: 'badge-possible',
  no: 'badge-no',
};

/** The stylesheet class for each reason kind, so each kind of blocker keeps one color. */
const REASON_CLASSES: Record<BucketReasonKind, string> = {
  ci: 'reason-ci',
  conflicts: 'reason-conflicts',
  'changes-requested': 'reason-changes-requested',
  dco: 'reason-dco',
  stale: 'reason-stale',
  duplicate: 'reason-duplicate',
  draft: 'reason-draft',
  approved: 'reason-approved',
  'no-blockers': 'reason-no-blockers',
};

/**
 * Helm's brand palette from helm/community, light and dark from
 * `prefers-color-scheme`, a navy masthead, bucket cards, and readable tables.
 */
const STYLE = `
:root {
  color-scheme: light dark;
  --helm-navy: #0F1689; --helm-blue-dark: #090E6F; --helm-blue-light: #1B53C2; --helm-shade-dark: #050843;
  --helm-shade-mid: #B7C2E9; --helm-shade-light: #DBE1F3;
  --helm-accent-blue: #3B82BF; --helm-accent-green: #2F84A7; --helm-accent-red: #95297C; --helm-accent-yellow: #D1AA9B;
  --fg: #1f2328; --bg: #f5f7fc; --surface: #ffffff; --muted: #59636e; --line: #dbe1f3; --link: #1B53C2; --row-hover: #f0f3fb;
  --tone-red: #95297C; --tone-tan: #87533f; --tone-blue: #1B53C2; --tone-green: #1d6a87; --tone-navy: #0F1689; --tone-gray: #59636e;
  --tone-crimson: #b42318; --tone-orange: #b54708; --tone-sky: #2d6aa0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #e8ebf7; --bg: #050843; --surface: #0b1052; --muted: #a7b0d8; --line: #232b78; --link: #9db8ff; --row-hover: #121a66;
    --tone-red: #e597d4; --tone-tan: #e6c4b6; --tone-blue: #9db8ff; --tone-green: #85cbe2; --tone-navy: #c3cdf0; --tone-gray: #a7b0d8;
    --tone-crimson: #ff9a8f; --tone-orange: #f9b47c; --tone-sky: #8fc3ee;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
a { color: var(--link); }
.wrap { margin: 0 auto; max-width: 80rem; padding: 0 1rem; }
.masthead { background: var(--helm-navy); color: #ffffff; padding: 1.25rem 0; }
.masthead .wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.pages { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-left: auto; }
.pages a { padding: 0.25rem 0.75rem; border: 1px solid var(--helm-shade-mid); border-radius: 999px; font-weight: 600; text-decoration: none; }
.pages a:hover { background: var(--helm-blue-dark); }
.masthead a { color: #ffffff; }
.logo { flex: none; width: 3rem; height: 3rem; }
.eyebrow { margin: 0; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--helm-shade-mid); }
h1 { margin: 0; font-size: 1.5rem; line-height: 1.25; }
.meta { margin: 0.25rem 0 0; color: var(--helm-shade-light); }
.buckets { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; margin: 1.5rem 0; padding: 0; list-style: none; }
.bucket-card { display: block; height: 100%; padding: 0.75rem 1rem; border: 1px solid var(--line); border-top: 4px solid var(--accent); border-radius: 0.5rem; background: var(--surface); color: var(--fg); text-decoration: none; }
.bucket-card:hover { border-color: var(--accent); }
.bucket-count { display: block; font-size: 2rem; font-weight: 700; line-height: 1.1; }
.bucket-empty .bucket-count { color: var(--muted); }
.bucket-title { display: block; font-weight: 600; }
.bucket-hint, .hint, .empty, .notes { color: var(--muted); }
.bucket-hint { display: block; font-size: 0.8125rem; }
.bucket-draft { --accent: var(--helm-shade-mid); }
.bucket-duplicate { --accent: var(--helm-accent-blue); }
.bucket-stale { --accent: var(--helm-accent-yellow); }
.bucket-needs-author { --accent: var(--helm-accent-red); }
.bucket-needs-second-approval { --accent: var(--helm-blue-light); }
.bucket-ready { --accent: var(--helm-accent-green); }
section { margin: 2rem 0; }
h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0; padding-left: 0.625rem; border-left: 4px solid var(--accent); font-size: 1.125rem; }
.count { padding: 0 0.5rem; border-radius: 999px; background: var(--line); font-size: 0.8125rem; }
.hint { margin: 0.25rem 0 0.75rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--surface); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--row-hover); }
.col-pr, .col-age, .col-waiting-since, .col-kind, .col-breaking, .col-needs-hip { white-space: nowrap; }
.col-title { min-width: 12rem; }
.col-pr a { font-weight: 600; }
.col-author, .col-age, .col-waiting-since { color: var(--muted); }
.badge { --tone: var(--tone-gray); display: inline-block; padding: 0 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; line-height: 1.5rem; color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, transparent); }
.badge-bug, .badge-yes { --tone: var(--tone-red); }
.badge-possible { --tone: var(--tone-tan); }
.badge-feature { --tone: var(--tone-blue); }
.badge-docs { --tone: var(--tone-green); }
.badge-refactor { --tone: var(--tone-navy); }
.badge-no { font-weight: 400; background: transparent; }
.pills { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.pill { --tone: var(--tone-gray); display: inline-flex; align-items: center; gap: 0.375rem; padding: 0 0.5rem; border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent); border-radius: 999px; background: color-mix(in srgb, var(--tone) 12%, transparent); color: var(--tone); font-size: 0.8125rem; font-weight: 500; line-height: 1.5rem; white-space: nowrap; }
.pill::before { content: ""; width: 0.4375rem; height: 0.4375rem; border-radius: 50%; background: currentColor; }
.reason-ci { --tone: var(--tone-crimson); }
.reason-conflicts { --tone: var(--tone-red); }
.reason-changes-requested { --tone: var(--tone-orange); }
.reason-dco { --tone: var(--tone-tan); }
.reason-stale { --tone: var(--tone-gray); }
.reason-draft { --tone: var(--tone-navy); }
.reason-duplicate { --tone: var(--tone-sky); }
.reason-approved { --tone: var(--tone-blue); }
.reason-no-blockers { --tone: var(--tone-green); }
footer { padding: 1rem 0 2rem; border-top: 1px solid var(--line); font-size: 0.8125rem; }
footer p { margin: 0.25rem 0; }
`;

/** `value` with every HTML-significant character replaced by its entity. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

/** The queue as a complete HTML document, ending with a newline. */
export function renderQueueHtml(sections: QueueSection[], options: QueueHtmlOptions): string {
  const columns = options.columns ?? QUEUE_COLUMNS;
  const repo = escapeHtml(options.repo);
  const generatedAt = escapeHtml(options.now.toISOString());
  const ordered = [...sections].sort(
    (left, right) => DASHBOARD_POSITION[left.bucket] - DASHBOARD_POSITION[right.bucket],
  );
  const openCount = sections.reduce((total, section) => total + section.entries.length, 0);
  const notes = (options.notes ?? []).map((note) => `<p>${escapeHtml(note)}</p>`).join('\n');
  const nav = navHtml(options.nav ?? []);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PR queue: ${repo}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="masthead">
<div class="wrap">
${HELM_LOGO_SVG}
<div>
<p class="eyebrow">helm-triage</p>
<h1>PR queue: ${repo}</h1>
<p class="meta"><a href="https://github.com/${repo}/pulls">Showing ${openCount} open ${openCount === 1 ? 'pull request' : 'pull requests'}</a> · Generated <time datetime="${generatedAt}">${generatedAt}</time></p>
</div>
${nav}</div>
</header>
<div class="wrap">
<nav aria-label="Buckets">
<ul class="buckets">
${ordered.map(bucketCardHtml).join('\n')}
</ul>
</nav>
<main>
${ordered.map((section) => sectionHtml(section, columns, options)).join('\n')}
</main>
<footer class="notes">
${notes === '' ? '' : `${notes}\n`}<p>Generated by <a href="${TOOL_URL}">helm-triage</a>. Buckets sort each pull request by who acts next; AI columns are advisory.</p>
<p>Helm and the Helm logo are trademarks of The Linux Foundation. This dashboard is not an official Helm project.</p>
</footer>
</div>
</body>
</html>
`;
}

/** The masthead links to other queue pages, or nothing when there are none. */
function navHtml(links: QueueNavLink[]): string {
  if (links.length === 0) {
    return '';
  }

  const anchors = links
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('');
  return `<nav class="pages" aria-label="Other queues">${anchors}</nav>\n`;
}

/** One bucket's card: its count, title, and hint, linking to its section. */
function bucketCardHtml(section: QueueSection): string {
  const emptyClass = section.entries.length === 0 ? ' bucket-empty' : '';

  return `<li><a class="bucket-card bucket-${section.bucket}${emptyClass}" href="#${section.bucket}"><span class="bucket-count">${section.entries.length}</span><span class="bucket-title">${escapeHtml(BUCKET_TITLES[section.bucket])}</span><span class="bucket-hint">${escapeHtml(BUCKET_HINTS[section.bucket])}</span></a></li>`;
}

/** One bucket: its heading with the count and hint, then its table, or a line saying it is empty. */
function sectionHtml(
  section: QueueSection,
  columns: QueueColumn[],
  options: QueueHtmlOptions,
): string {
  const heading = `<h2>${escapeHtml(BUCKET_TITLES[section.bucket])} <span class="count">${section.entries.length}</span></h2>
<p class="hint">${escapeHtml(BUCKET_HINTS[section.bucket])}</p>`;
  const open = `<section id="${section.bucket}" class="bucket-${section.bucket}">`;
  if (section.entries.length === 0) {
    return `${open}\n${heading}\n<p class="empty">None.</p>\n</section>`;
  }

  const headerRow = columns
    .map((column) => `<th class="${columnClass(column)}">${escapeHtml(column.header)}</th>`)
    .join('');
  const rows = section.entries
    .map(
      (entry) =>
        `<tr>${columns.map((column) => `<td class="${columnClass(column)}">${cellHtml(column, entry, options)}</td>`).join('')}</tr>`,
    )
    .join('\n');

  return `${open}
${heading}
<div class="table-wrap"><table>
<thead><tr>${headerRow}</tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
</section>`;
}

/** The class naming a column in the stylesheet: `col-` and its header in kebab case. */
function columnClass(column: QueueColumn): string {
  const slug = column.header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `col-${slug}`;
}

/**
 * A cell's escaped text: linked to the pull request when its column asks for
 * that, one pill per value when its column splits into pills, or a badge when
 * its column has a typed value for the row.
 */
function cellHtml(column: QueueColumn, entry: QueueEntry, options: QueueHtmlOptions): string {
  const text = escapeHtml(column.cell(entry, options.now));
  if (column.linksToPr) {
    const url = `https://github.com/${options.repo}/pull/${entry.snapshot.number}`;
    return `<a href="${escapeHtml(url)}">${text}</a>`;
  }

  const pills = column.pills?.(entry);
  if (pills !== undefined) {
    return `<span class="pills">${pills.map(reasonPillHtml).join('')}</span>`;
  }

  const badge = column.badge?.(entry);
  if (badge === undefined) {
    return text;
  }

  return `<span class="${badgeClass(badge)}">${text}</span>`;
}

/** One reason as a pill colored by its kind, the class taken from the fixed table only. */
function reasonPillHtml(reason: BucketReason): string {
  const kindClass = Object.hasOwn(REASON_CLASSES, reason.kind)
    ? ` ${REASON_CLASSES[reason.kind]}`
    : '';

  return `<span class="pill${kindClass}">${escapeHtml(reason.text)}</span>`;
}

/** The badge's classes, from the fixed table only, so model output never reaches an attribute. */
function badgeClass(badge: QueueBadge): string {
  return Object.hasOwn(BADGE_CLASSES, badge) ? `badge ${BADGE_CLASSES[badge]}` : 'badge';
}
