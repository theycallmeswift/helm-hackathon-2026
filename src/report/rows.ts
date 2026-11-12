/**
 * The format-neutral parts of a readiness report: status marks, capped
 * evidence lists, the short head SHA, and one row per AI flag. The text and
 * markdown renderers lay these out and escape them as their format needs.
 */

import type { AiEvidence, AiFlags, CheckStatus } from '../pr/types.ts';

/**
 * The emoji each check status renders as, in both formats. The warn and info
 * marks carry U+FE0F so terminals and GitHub draw them as emoji, not text.
 */
export const STATUS_MARKS: Record<CheckStatus, string> = {
  pass: '✅',
  warn: '⚠\uFE0F',
  fail: '❌',
  info: 'ℹ\uFE0F',
};

/** How many evidence lines a check or flag shows before the "and N more" tail. */
export const MAX_EVIDENCE_LINES = 5;

/** How many characters of the head SHA a report shows. */
const SHORT_SHA_LENGTH = 7;

/** The line AI output always sits under, so nobody mistakes a flag for a verdict. */
export const ADVISORY_NOTICE = 'AI flags are advisory; a maintainer decides.';

/** The head SHA shortened the way git abbreviates it. */
export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/**
 * The first `MAX_EVIDENCE_LINES` lines, followed by an "and N more" line when
 * any were left out.
 */
export function capEvidence(lines: string[]): string[] {
  if (lines.length <= MAX_EVIDENCE_LINES) {
    return lines;
  }

  const hiddenCount = lines.length - MAX_EVIDENCE_LINES;
  return [...lines.slice(0, MAX_EVIDENCE_LINES), `and ${hiddenCount} more`];
}

/** One AI evidence entry as a single line: the file, then its hunk and quote when present. */
export function describeAiEvidence(evidence: AiEvidence): string {
  const parts = [evidence.file];
  if (evidence.hunk !== undefined) {
    parts.push(evidence.hunk);
  }
  if (evidence.quote !== undefined) {
    parts.push(`"${evidence.quote}"`);
  }
  return parts.join(' ');
}

/** One AI flag ready to lay out: what it is, what it says, and what grounds it. */
export interface AiFlagRow {
  /** The flag's name, such as `breaking change`. */
  label: string;
  /** The flag's answer, such as `bug`, `possible`, or the summary text. */
  value: string;
  /** Absent for flags the model gives no confidence for. */
  confidence?: string;
  /** Why the model said so; absent when the value already is the explanation. */
  reason?: string;
  /** Evidence lines, already capped. */
  evidence: string[];
}

/** The AI flags in the order reports list them. */
export function aiFlagRows(flags: AiFlags): AiFlagRow[] {
  const describeAll = (evidence: AiEvidence[]) => capEvidence(evidence.map(describeAiEvidence));

  return [
    {
      label: 'kind',
      value: flags.kind.kind,
      confidence: flags.kind.confidence,
      reason: flags.kind.reason,
      evidence: describeAll(flags.kind.evidence),
    },
    {
      label: 'breaking change',
      value: flags.breakingChange.verdict,
      confidence: flags.breakingChange.confidence,
      reason: flags.breakingChange.reason,
      evidence: describeAll(flags.breakingChange.evidence),
    },
    {
      label: 'needs HIP',
      value: flags.needsHip.verdict,
      confidence: flags.needsHip.confidence,
      reason: flags.needsHip.reason,
      evidence: describeAll(flags.needsHip.evidence),
    },
    {
      label: 'summary',
      value: flags.summary.summary,
      evidence: describeAll(flags.summary.evidence),
    },
    { label: 'review focus', value: flags.summary.reviewFocus, evidence: [] },
  ];
}
