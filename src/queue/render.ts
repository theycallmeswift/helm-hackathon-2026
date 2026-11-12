/**
 * Renders the queue as plain text or a markdown table: one section per
 * bucket with its count, then one row per pull request. Every row is built
 * from `QUEUE_COLUMNS`, so a new column is one entry there.
 */

import { isoDate } from '../checks/context.ts';
import { escapeMarkdown, table } from '../report/markdown.ts';
import { flatten } from '../report/text.ts';
import { BUCKET_TITLES } from './buckets.ts';
import type { QueueEntry, QueueSection } from './build.ts';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** One column of a queue row. */
export interface QueueColumn {
  header: string;
  /** The cell's unescaped text; each renderer escapes it for its format. */
  cell: (entry: QueueEntry, now: Date) => string;
}

/** The columns every queue row shows, in order. */
export const QUEUE_COLUMNS: QueueColumn[] = [
  { header: 'PR', cell: (entry) => `#${entry.snapshot.number}` },
  { header: 'Title', cell: (entry) => entry.snapshot.title },
  { header: 'Author', cell: (entry) => entry.snapshot.author.login },
  { header: 'Age', cell: (entry, now) => `${wholeDaysBetween(entry.snapshot.createdAt, now)}d` },
  { header: 'Waiting since', cell: (entry) => isoDate(entry.waitingSince) },
  { header: 'Reason', cell: (entry) => entry.reason },
];

/** Whole days from `from` to `to`, rounded down. */
function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY);
}

/** The heading line for a section: its title and count. */
function sectionHeading(section: QueueSection): string {
  return `${BUCKET_TITLES[section.bucket]} (${section.entries.length})`;
}

/**
 * The queue as terminal text, ending with a newline: each section's heading,
 * then its rows with columns separated by two spaces and padded to line up.
 */
export function renderQueueText(sections: QueueSection[], now: Date): string {
  const blocks = sections.map((section) => {
    const rows = section.entries.map((entry) =>
      QUEUE_COLUMNS.map((column) => flatten(column.cell(entry, now))),
    );

    return [sectionHeading(section), ...alignColumns(rows).map((line) => `  ${line}`)].join('\n');
  });

  return `${blocks.join('\n\n')}\n`;
}

/** Pads every cell but the last to its column's widest, so rows line up. */
function alignColumns(rows: string[][]): string[] {
  const widths = QUEUE_COLUMNS.map((_, index) =>
    Math.max(...rows.map((row) => (row[index] ?? '').length)),
  );

  return rows.map((row) =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
      .join('  '),
  );
}

/** The queue as markdown, ending with a newline: a heading and table per non-empty section. */
export function renderQueueMarkdown(sections: QueueSection[], now: Date): string {
  const blocks = sections.map((section) => {
    const heading = `## ${sectionHeading(section)}`;
    if (section.entries.length === 0) {
      return heading;
    }

    const rows = section.entries.map((entry) =>
      QUEUE_COLUMNS.map((column) => escapeMarkdown(column.cell(entry, now))),
    );
    return `${heading}\n\n${table(
      QUEUE_COLUMNS.map((column) => column.header),
      rows,
    )}`;
  });

  return `${blocks.join('\n\n')}\n`;
}
