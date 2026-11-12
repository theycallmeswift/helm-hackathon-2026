/**
 * Renders a readiness report as plain terminal text: a header, one line of
 * check marks, the evidence behind failing and warning checks, then the AI
 * flags. No ANSI color, so the output pastes and diffs cleanly.
 */

import type { AiOutcome, CheckResult, ReadinessReport } from '../pr/types.ts';
import { ADVISORY_NOTICE, aiFlagRows, capEvidence, STATUS_MARKS, shortSha } from './rows.ts';

const INDENT = '  ';
const AI_PREFIX = `${INDENT}🤖 `;

/** The report as terminal text, ending with a newline. */
export function renderText(report: ReadinessReport): string {
  const { pr } = report;
  const lines = [
    `${pr.repo}#${pr.number} ${flatten(pr.title)} (${shortSha(pr.headSha)})`,
    INDENT +
      report.checks.map((check) => `${check.title} ${STATUS_MARKS[check.status]}`).join('  '),
    ...report.checks.flatMap(concernLines),
    ...aiLines(report.ai),
  ];

  return `${lines.join('\n')}\n`;
}

/** A failing or warning check's summary with its evidence beneath; nothing for other checks. */
function concernLines(check: CheckResult): string[] {
  if (check.status !== 'fail' && check.status !== 'warn') {
    return [];
  }

  const heading = `${INDENT}${STATUS_MARKS[check.status]} ${check.title}: ${flatten(check.summary)}`;
  const evidence = capEvidence(check.evidence).map(
    (line) => `${INDENT.repeat(2)}- ${flatten(line)}`,
  );
  return [heading, ...evidence];
}

/** The AI section: the flags under the advisory notice, or one line saying why there are none. */
function aiLines(ai: AiOutcome): string[] {
  if (ai.status === 'skipped') {
    return [`${AI_PREFIX}AI flags skipped: ${flatten(ai.reason)}`];
  }
  if (ai.status === 'failed') {
    return [`${AI_PREFIX}AI flags failed: ${flatten(ai.reason)}`];
  }

  const flagLines = aiFlagRows(ai.flags).flatMap((row) => {
    const confidence = row.confidence === undefined ? '' : ` (${row.confidence})`;
    const reason = row.reason === undefined ? '' : ` — ${flatten(row.reason)}`;
    const evidence = row.evidence.map((line) => `${INDENT.repeat(3)}${flatten(line)}`);
    return [`${AI_PREFIX}${row.label}: ${flatten(row.value)}${confidence}${reason}`, ...evidence];
  });
  return [`${AI_PREFIX}${ADVISORY_NOTICE} Model: ${ai.model}.`, ...flagLines];
}

/**
 * Collapses line breaks and strips other control characters, so one field can
 * never spill into a line of its own or send escape sequences to the terminal.
 */
export function flatten(value: string): string {
  return value
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replaceAll('\t', ' ')
    .replace(/\p{Cc}/gu, '');
}
