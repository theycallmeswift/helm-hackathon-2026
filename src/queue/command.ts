/**
 * The `queue` command: sorts every open pull request into a bucket by who
 * must act next and prints the buckets, oldest waiting first. It only reads
 * from GitHub.
 */

import { parseArgs } from 'node:util';

import { type Environment, loadConfig, parseRepoName } from '../config/load.ts';
import type { RepoName } from '../pr/types.ts';
import { aiFooterLines, fillAiFlags } from './ai-columns.ts';
import { buildQueue } from './build.ts';
import { renderQueueHtml } from './html.ts';
import { QUEUE_AI_COLUMNS, QUEUE_COLUMNS, renderQueueMarkdown, renderQueueText } from './render.ts';

/** The output formats `--format` accepts. */
const FORMATS = ['text', 'md', 'html'] as const;

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
  ai: boolean;
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

  const repo = request.repo ?? config.defaultRepo;
  const sections = await buildQueue(config, {
    repo,
    now,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
  const footer = request.ai ? aiFooterLines(await fillAiFlags(sections, config)) : [];
  const columns = request.ai ? [...QUEUE_COLUMNS, ...QUEUE_AI_COLUMNS] : QUEUE_COLUMNS;
  if (request.format === 'html') {
    process.stdout.write(renderQueueHtml(sections, { repo, now, columns, notes: footer }));

    return 0;
  }

  const render = request.format === 'md' ? renderQueueMarkdown : renderQueueText;
  process.stdout.write(render(sections, now, columns));
  if (footer.length > 0) {
    process.stdout.write(`\n${footer.join('\n')}\n`);
  }

  return 0;
}

/**
 * Reads `[--repo owner/name] [--format text|md|html] [--limit N] [--ai]`.
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
      ai: { type: 'boolean', default: false },
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
    ai: values.ai,
    ...(values.repo === undefined ? {} : { repo: parseRepoName(values.repo, '--repo') }),
    ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
  };
}

/** Whether `value` names an output format. */
function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}
