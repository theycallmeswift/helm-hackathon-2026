/**
 * The `pr` command: fetches one pull request, runs the readiness checks and
 * the advisory AI flags, and prints the report. A report with failing checks
 * or failed AI flags still exits 0; only errors that stop a report from
 * printing, such as a bad argument or an unreachable API, throw.
 */

import { parseArgs } from 'node:util';

import { getAiFlags } from '../ai/flags.ts';
import { runChecks } from '../checks/run.ts';
import { type Environment, loadConfig, parseRepoName } from '../config/load.ts';
import { fetchPrSnapshot } from '../github/snapshot.ts';
import { renderMarkdown } from '../report/markdown.ts';
import { renderText } from '../report/text.ts';
import type { ReadinessReport, RepoName } from './types.ts';

/** The report formats `--format` accepts. */
const FORMATS = ['text', 'md'] as const;

/** One report format. */
type Format = (typeof FORMATS)[number];

/** The arguments the `pr` command was given are unusable. */
export class PrUsageError extends Error {
  override name = 'PrUsageError';
}

/** What the `pr` command was asked to do. */
interface PrRequest {
  number: number;
  repo?: RepoName;
  format: Format;
}

/**
 * Prints the readiness report for the pull request `args` names to stdout
 * and resolves to the exit code.
 *
 * @throws {PrUsageError} when the arguments are malformed.
 * @throws when the configuration is malformed or GitHub cannot be read.
 */
export async function runPrCommand(args: string[], env: Environment): Promise<number> {
  const request = parsePrArgs(args);
  const config = loadConfig(env);
  const repo = request.repo ?? config.defaultRepo;

  const snapshot = await fetchPrSnapshot(config, repo, request.number);
  const report: ReadinessReport = {
    pr: snapshot,
    checks: runChecks(snapshot, { now: new Date() }),
    ai: await getAiFlags(snapshot, config),
  };
  process.stdout.write(request.format === 'md' ? renderMarkdown(report) : renderText(report));

  return 0;
}

/**
 * Reads `<number> [--repo owner/name] [--format text|md]`.
 *
 * @throws {PrUsageError} when an argument is missing, unknown, or malformed.
 */
function parsePrArgs(args: string[]): PrRequest {
  const { values, positionals } = parseArgs({
    args,
    options: {
      repo: { type: 'string' },
      format: { type: 'string', default: 'text' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length !== 1) {
    throw new PrUsageError('pr takes exactly one pull request number');
  }
  const [numberArg = ''] = positionals;
  if (!/^[1-9]\d*$/.test(numberArg)) {
    throw new PrUsageError(
      `pull request number must be a positive whole number, got "${numberArg}"`,
    );
  }
  if (!isFormat(values.format)) {
    throw new PrUsageError(`--format must be one of ${FORMATS.join(', ')}, got "${values.format}"`);
  }

  return {
    number: Number(numberArg),
    format: values.format,
    ...(values.repo === undefined ? {} : { repo: parseRepoName(values.repo, '--repo') }),
  };
}

/** Whether `value` names a report format. */
function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}
