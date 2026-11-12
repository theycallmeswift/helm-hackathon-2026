/**
 * Renders a readiness report as a markdown pull request comment: a hidden
 * marker that identifies the comment, the pull request and commit, a table of
 * checks, and the advisory AI section. Every variable field is escaped and
 * kept inside a table cell, so hostile titles or evidence cannot break the
 * layout and long text cannot trip line-length lint rules.
 */

import type { AiOutcome, CheckResult, ReadinessReport } from '../pr/types.ts';
import {
  ADVISORY_NOTICE,
  type AiFlagRow,
  aiFlagRows,
  capEvidence,
  STATUS_MARKS,
  shortSha,
} from './rows.ts';

/** The first line of every readiness comment, so automation can find and update it. */
export const READINESS_MARKER = '<!-- helm-triage:readiness -->';

/** Separates evidence lines inside one table cell, where line breaks would end the row. */
const EVIDENCE_SEPARATOR = '; ';

/** Fills a cell that has nothing to show, so no row has an empty column. */
const EMPTY_CELL = '—';

/** The report as a markdown comment body, starting with `READINESS_MARKER` and ending with a newline. */
export function renderMarkdown(report: ReadinessReport): string {
  const { pr } = report;
  const sections = [
    READINESS_MARKER,
    '# helm-triage readiness',
    table(
      ['Pull request', 'Commit'],
      [
        [
          `[${escapeMarkdown(`${pr.repo}#${pr.number}: ${pr.title}`)}](${pr.url})`,
          `\`${shortSha(pr.headSha)}\``,
        ],
      ],
    ),
    '## Checks',
    table(['Check', 'Status', 'Summary', 'Evidence'], report.checks.map(checkRow)),
    '## Advisory (AI)',
    ...aiSection(report.ai),
  ];

  return `${sections.join('\n\n')}\n`;
}

/** One check as table cells. */
function checkRow(check: CheckResult): string[] {
  return [
    escapeMarkdown(check.title),
    `${STATUS_MARKS[check.status]} ${check.status}`,
    escapeMarkdown(check.summary),
    evidenceCell(capEvidence(check.evidence)),
  ];
}

/** The AI section's blocks: the flags under the advisory notice, or why there are none. */
function aiSection(ai: AiOutcome): string[] {
  if (ai.status !== 'ok') {
    return [table(['AI flags', 'Reason'], [[ai.status, escapeMarkdown(ai.reason)]])];
  }

  return [
    `${ADVISORY_NOTICE} Model: \`${ai.model.replaceAll('`', '')}\`.`,
    table(['Flag', 'Value', 'Confidence', 'Reason', 'Evidence'], aiFlagRows(ai.flags).map(flagRow)),
  ];
}

/** One AI flag as table cells. */
function flagRow(row: AiFlagRow): string[] {
  return [
    row.label,
    escapeMarkdown(row.value),
    row.confidence ?? EMPTY_CELL,
    row.reason === undefined ? EMPTY_CELL : escapeMarkdown(row.reason),
    evidenceCell(row.evidence),
  ];
}

/** Evidence lines joined into one escaped cell. */
function evidenceCell(lines: string[]): string {
  if (lines.length === 0) {
    return EMPTY_CELL;
  }

  return lines.map(escapeMarkdown).join(EVIDENCE_SEPARATOR);
}

/** A GitHub-flavored markdown table. Cells must already be escaped. */
function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

/**
 * Makes untrusted text inert inside a table cell: line breaks become spaces,
 * and every character that could end the cell, open a code span, emphasis,
 * link, or HTML tag, or start an entity is backslash-escaped.
 */
function escapeMarkdown(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\\`*_[\]|<>&]/g, '\\$&');
}
