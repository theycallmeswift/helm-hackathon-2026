/**
 * The `queue` command: sorts every open pull request into a bucket by who
 * must act next and prints the buckets, oldest waiting first. It only reads
 * from GitHub.
 */

import { parseArgs } from 'node:util';

import { type Environment, loadConfig, parseRepoName } from '../config/load.ts';
import type { RepoName } from '../pr/types.ts';
import { buildQueue } from './build.ts';
import { renderQueueMarkdown, renderQueueText } from './render.ts';

/** The output formats `--format` accepts. */
const FORMATS = ['text', 'md'] as const;

/** One output format. */
type Format = (typeof FORMATS)[number];

/** The arguments the `queue` command was given are unusable. */
export class QueueUsageError extends Error {
  override name = 'QueueUsageError';
}

/** What the `queue` command was asked to do. */
interface QueueRequest {
  repo?: RepoName;
  format: Format;
  limit?: number;
}

/**
 * Prints the queue for the repository `args` names to stdout and resolves to
 * the exit code.
 *
 * @throws {QueueUsageError} when the arguments are malformed.
 * @throws when the configuration is malformed or GitHub cannot be read.
 */
export async function runQueueCommand(args: string[], env: Environment): Promise<number> {
  const request = parseQueueArgs(args);
  const config = loadConfig(env);
  const now = new Date();

  const sections = await buildQueue(config, {
    repo: request.repo ?? config.defaultRepo,
    now,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
  process.stdout.write(
    request.format === 'md' ? renderQueueMarkdown(sections, now) : renderQueueText(sections, now),
  );

  return 0;
}

/**
 * Reads `[--repo owner/name] [--format text|md] [--limit N]`.
 *
 * @throws {QueueUsageError} when an argument is unknown or malformed.
 */
function parseQueueArgs(args: string[]): QueueRequest {
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: 'string' },
      format: { type: 'string', default: 'text' },
      limit: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (!isFormat(values.format)) {
    throw new QueueUsageError(
      `--format must be one of ${FORMATS.join(', ')}, got "${values.format}"`,
    );
  }
  if (values.limit !== undefined && !/^[1-9]\d*$/.test(values.limit)) {
    throw new QueueUsageError(`--limit must be a positive whole number, got "${values.limit}"`);
  }

  return {
    format: values.format,
    ...(values.repo === undefined ? {} : { repo: parseRepoName(values.repo, '--repo') }),
    ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
  };
}

/** Whether `value` names an output format. */
function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}
