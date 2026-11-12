/**
 * Renders the queue as one self-contained HTML page for the public
 * dashboard: inline CSS, no JavaScript, no external assets. Pull request
 * text is untrusted, so every value is escaped, and links are built only from
 * the repository and pull request number.
 */

import type { RepoName } from '../pr/types.ts';
import { BUCKET_TITLES } from './buckets.ts';
import type { QueueEntry, QueueSection } from './build.ts';
import { QUEUE_COLUMNS, type QueueColumn } from './render.ts';

/** What the page shows besides the sections. */
export interface QueueHtmlOptions {
  repo: RepoName;
  /** When the queue was built; shown as the generation time and used for ages. */
  now: Date;
  columns?: QueueColumn[];
  /** Lines shown under the tables, such as how many pull requests lack AI flags. */
  notes?: string[];
}

/** Characters with meaning in HTML text or attribute values, and their entities. */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Light and dark colors from `prefers-color-scheme`, and readable tables. */
const STYLE = `
:root { color-scheme: light dark; --fg: #1f2328; --bg: #ffffff; --muted: #59636e; --line: #d1d9e0; --link: #0969da; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #f0f6fc; --bg: #0d1117; --muted: #9198a1; --line: #3d444d; --link: #4493f8; }
}
body { margin: 0 auto; max-width: 80rem; padding: 1rem; font: 14px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
a { color: var(--link); }
header p, .empty, .notes { color: var(--muted); }
.counts { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0; list-style: none; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.col-pr, .col-age, .col-waiting-since, .col-kind, .col-breaking, .col-needs-hip { white-space: nowrap; }
.col-title { min-width: 12rem; }
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
  const counts = sections
    .map(
      (section) =>
        `<li><a href="#${section.bucket}">${escapeHtml(BUCKET_TITLES[section.bucket])}</a>: ${section.entries.length}</li>`,
    )
    .join('\n');
  const notes = (options.notes ?? []).map((note) => `<p>${escapeHtml(note)}</p>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PR queue: ${repo}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>PR queue: ${repo}</h1>
<p>Generated <time datetime="${generatedAt}">${generatedAt}</time></p>
<ul class="counts">
${counts}
</ul>
</header>
<main>
${sections.map((section) => sectionHtml(section, columns, options)).join('\n')}
</main>
${notes === '' ? '' : `<footer class="notes">\n${notes}\n</footer>\n`}</body>
</html>
`;
}

/** One bucket: its heading with the count, then its table, or a line saying it is empty. */
function sectionHtml(
  section: QueueSection,
  columns: QueueColumn[],
  options: QueueHtmlOptions,
): string {
  const heading = `<h2>${escapeHtml(BUCKET_TITLES[section.bucket])} (${section.entries.length})</h2>`;
  if (section.entries.length === 0) {
    return `<section id="${section.bucket}">\n${heading}\n<p class="empty">None.</p>\n</section>`;
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

  return `<section id="${section.bucket}">
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

/** A cell's escaped text, linked to the pull request when its column asks for that. */
function cellHtml(column: QueueColumn, entry: QueueEntry, options: QueueHtmlOptions): string {
  const text = escapeHtml(column.cell(entry, options.now));
  if (!column.linksToPr) {
    return text;
  }

  const url = `https://github.com/${options.repo}/pull/${entry.snapshot.number}`;
  return `<a href="${escapeHtml(url)}">${text}</a>`;
}
