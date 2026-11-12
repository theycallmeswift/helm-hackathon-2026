/**
 * Renders the queue as plain text or a markdown table: one section per
 * bucket with its count, then one row per pull request. Every row is built
 * from `QUEUE_COLUMNS`, plus `QUEUE_AI_COLUMNS` with `--ai`, so a new column
 * is one entry there.
 */

import { isoDate } from '../checks/context.ts';
import type { Likelihood, PrKind } from '../pr/types.ts';
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
  /** Whether formats with links link this cell to the pull request. */
  linksToPr?: boolean;
  /** The separate values the cell joins, for formats that draw each as a pill. */
  pills?: (entry: QueueEntry) => string[];
  /** The typed value behind the cell, for formats that draw it as a colored badge. */
  badge?: (entry: QueueEntry) => QueueBadge | undefined;
}

/** A value an AI column can show as a badge: a suggested kind or a likelihood. */
export type QueueBadge = PrKind | Likelihood;

/** The columns every queue row shows, in order. */
export const QUEUE_COLUMNS: QueueColumn[] = [
  { header: 'PR', cell: (entry) => `#${entry.snapshot.number}`, linksToPr: true },
  { header: 'Title', cell: (entry) => entry.snapshot.title },
  { header: 'Author', cell: (entry) => entry.snapshot.author.login },
  { header: 'Age', cell: (entry, now) => `${wholeDaysBetween(entry.snapshot.createdAt, now)}d` },
  { header: 'Waiting since', cell: (entry) => isoDate(entry.waitingSince) },
  {
    header: 'Reason',
    cell: (entry) => entry.reasons.join('; '),
    pills: (entry) => entry.reasons,
  },
];

/** Shown in an AI column when a pull request has no usable AI flags. */
export const NO_AI_DATA = '-';

/** The columns `--ai` adds after `QUEUE_COLUMNS`, read from `entry.ai`. */
export const QUEUE_AI_COLUMNS: QueueColumn[] = [
  {
    header: 'Kind',
    cell: (entry) =>
      entry.ai?.status === 'ok'
        ? `${entry.ai.flags.kind.kind} (${entry.ai.flags.kind.confidence})`
        : NO_AI_DATA,
    badge: (entry) => (entry.ai?.status === 'ok' ? entry.ai.flags.kind.kind : undefined),
  },
  {
    header: 'Breaking',
    cell: (entry) =>
      entry.ai?.status === 'ok' ? entry.ai.flags.breakingChange.verdict : NO_AI_DATA,
    badge: (entry) =>
      entry.ai?.status === 'ok' ? entry.ai.flags.breakingChange.verdict : undefined,
  },
  {
    header: 'Needs HIP',
    cell: (entry) => (entry.ai?.status === 'ok' ? entry.ai.flags.needsHip.verdict : NO_AI_DATA),
    badge: (entry) => (entry.ai?.status === 'ok' ? entry.ai.flags.needsHip.verdict : undefined),
  },
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
export function renderQueueText(
  sections: QueueSection[],
  now: Date,
  columns: QueueColumn[] = QUEUE_COLUMNS,
): string {
  const blocks = sections.map((section) => {
    const rows = section.entries.map((entry) =>
      columns.map((column) => flatten(column.cell(entry, now))),
    );

    return [
      sectionHeading(section),
      ...alignColumns(rows, columns.length).map((line) => `  ${line}`),
    ].join('\n');
  });

  return `${blocks.join('\n\n')}\n`;
}

/** Pads every cell but the last to its column's widest, so rows line up. */
function alignColumns(rows: string[][], columnCount: number): string[] {
  const widths = Array.from({ length: columnCount }, (_, index) =>
    Math.max(...rows.map((row) => (row[index] ?? '').length)),
  );

  return rows.map((row) =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
      .join('  '),
  );
}

/** The queue as markdown, ending with a newline: a heading and table per non-empty section. */
export function renderQueueMarkdown(
  sections: QueueSection[],
  now: Date,
  columns: QueueColumn[] = QUEUE_COLUMNS,
): string {
  const blocks = sections.map((section) => {
    const heading = `## ${sectionHeading(section)}`;
    if (section.entries.length === 0) {
      return heading;
    }

    const rows = section.entries.map((entry) =>
      columns.map((column) => escapeMarkdown(column.cell(entry, now))),
    );
    return `${heading}\n\n${table(
      columns.map((column) => column.header),
      rows,
    )}`;
  });

  return `${blocks.join('\n\n')}\n`;
}
