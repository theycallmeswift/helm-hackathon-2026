/**
 * The JSON schema the model must answer with, and the hand-written check that
 * turns its answer into `AiFlags`. The schema is strict, so every property is
 * required and optional evidence fields are nullable instead of absent.
 */

import type {
  AiEvidence,
  AiFlags,
  BreakingChangeFlag,
  Confidence,
  KindFlag,
  Likelihood,
  NeedsHipFlag,
  PrKind,
  PrSnapshot,
  SummaryFlag,
} from '../pr/types.ts';

/** The model's answer did not match the schema or cited no usable evidence. */
export class MalformedAnswerError extends Error {
  override name = 'MalformedAnswerError';
}

const KINDS: readonly PrKind[] = ['bug', 'feature', 'docs', 'refactor', 'chore'];
const CONFIDENCES: readonly Confidence[] = ['low', 'medium', 'high'];
const LIKELIHOODS: readonly Likelihood[] = ['yes', 'possible', 'no'];

/** A JSON schema object; only the shapes this module writes. */
type JsonSchema = Readonly<Record<string, unknown>>;

/** Builds a strict object schema in which every property is required. */
function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const EVIDENCE_SCHEMA = {
  type: 'array',
  items: strictObject({
    file: { type: 'string' },
    hunk: { type: ['string', 'null'] },
    quote: { type: ['string', 'null'] },
  }),
} as const;

const VERDICT_FLAG_SCHEMA = strictObject({
  verdict: { type: 'string', enum: LIKELIHOODS },
  confidence: { type: 'string', enum: CONFIDENCES },
  reason: { type: 'string' },
  evidence: EVIDENCE_SCHEMA,
});

/** The schema sent as `response_format.json_schema.schema`. */
export const AI_FLAGS_SCHEMA: JsonSchema = strictObject({
  kind: strictObject({
    kind: { type: 'string', enum: KINDS },
    confidence: { type: 'string', enum: CONFIDENCES },
    reason: { type: 'string' },
    evidence: EVIDENCE_SCHEMA,
  }),
  breakingChange: VERDICT_FLAG_SCHEMA,
  needsHip: VERDICT_FLAG_SCHEMA,
  summary: strictObject({
    summary: { type: 'string' },
    reviewFocus: { type: 'string' },
    evidence: EVIDENCE_SCHEMA,
  }),
});

/**
 * Parses the model's message content into flags for `snapshot`. Evidence
 * citing a file the pull request does not change, or giving neither a hunk
 * nor a quote, is dropped.
 *
 * @throws {MalformedAnswerError} when the content is not JSON, does not match
 * the schema, or a flag is left with no evidence.
 */
export function parseAiFlags(content: string, snapshot: PrSnapshot): AiFlags {
  let answer: unknown;
  try {
    answer = JSON.parse(content);
  } catch {
    throw new MalformedAnswerError('the model answer is not valid JSON');
  }

  const changedFiles = new Set(snapshot.files.map((file) => file.path));
  const root = readObject(answer, 'answer');

  return {
    kind: readKindFlag(readObject(root.kind, 'kind'), changedFiles),
    breakingChange: readVerdictFlag(
      readObject(root.breakingChange, 'breakingChange'),
      'breakingChange',
      changedFiles,
    ),
    needsHip: readVerdictFlag(readObject(root.needsHip, 'needsHip'), 'needsHip', changedFiles),
    summary: readSummaryFlag(readObject(root.summary, 'summary'), changedFiles),
  };
}

/** Reads the `kind` flag. */
function readKindFlag(flag: Record<string, unknown>, changedFiles: Set<string>): KindFlag {
  return {
    kind: readEnum(flag.kind, KINDS, 'kind.kind'),
    confidence: readEnum(flag.confidence, CONFIDENCES, 'kind.confidence'),
    reason: readString(flag.reason, 'kind.reason'),
    evidence: readEvidence(flag.evidence, 'kind', changedFiles),
  };
}

/** Reads a yes/possible/no flag such as `breakingChange` or `needsHip`. */
function readVerdictFlag(
  flag: Record<string, unknown>,
  path: string,
  changedFiles: Set<string>,
): BreakingChangeFlag & NeedsHipFlag {
  return {
    verdict: readEnum(flag.verdict, LIKELIHOODS, `${path}.verdict`),
    confidence: readEnum(flag.confidence, CONFIDENCES, `${path}.confidence`),
    reason: readString(flag.reason, `${path}.reason`),
    evidence: readEvidence(flag.evidence, path, changedFiles),
  };
}

/** Reads the `summary` flag. */
function readSummaryFlag(flag: Record<string, unknown>, changedFiles: Set<string>): SummaryFlag {
  return {
    summary: readString(flag.summary, 'summary.summary'),
    reviewFocus: readString(flag.reviewFocus, 'summary.reviewFocus'),
    evidence: readEvidence(flag.evidence, 'summary', changedFiles),
  };
}

/**
 * Reads a flag's evidence list, keeping only items grounded in a changed file.
 *
 * @throws {MalformedAnswerError} when the list is malformed or nothing usable is left.
 */
function readEvidence(value: unknown, flagName: string, changedFiles: Set<string>): AiEvidence[] {
  const path = `${flagName}.evidence`;
  if (!Array.isArray(value)) {
    throw new MalformedAnswerError(`${path} is not an array`);
  }

  const evidence = value
    .map((item: unknown, index) => readEvidenceItem(item, `${path}[${index}]`))
    .filter((item) => changedFiles.has(item.file) && (item.hunk ?? item.quote) !== undefined);

  if (evidence.length === 0) {
    throw new MalformedAnswerError(
      `the ${flagName} flag cites no file the pull request changes, so it has no evidence`,
    );
  }

  return evidence;
}

/** Reads one evidence item, dropping null or empty hunk and quote fields. */
function readEvidenceItem(value: unknown, path: string): AiEvidence {
  const item = readObject(value, path);
  const hunk = readOptionalString(item.hunk, `${path}.hunk`);
  const quote = readOptionalString(item.quote, `${path}.quote`);

  return {
    file: readString(item.file, `${path}.file`),
    ...(hunk === undefined ? {} : { hunk }),
    ...(quote === undefined ? {} : { quote }),
  };
}

/** Reads a plain object. */
function readObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedAnswerError(`${path} is not an object`);
  }

  return value as Record<string, unknown>;
}

/** Reads a non-empty string. */
function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MalformedAnswerError(`${path} is not a non-empty string`);
  }

  return value;
}

/** Reads a string or null, treating null and empty strings as absent. */
function readOptionalString(value: unknown, path: string): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return readString(value, path);
}

/** Reads one of `allowed`. */
function readEnum<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value {
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    throw new MalformedAnswerError(`${path} must be one of ${allowed.join(', ')}`);
  }

  return match;
}
