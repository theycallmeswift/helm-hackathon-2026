#!/usr/bin/env node
/**
 * The Action's posting step: reads a rendered markdown report from the file
 * named by the one argument and upserts it as the pull request's readiness
 * comment. Reads `GITHUB_REPOSITORY`, `PR_NUMBER`, `GITHUB_TOKEN`, and
 * `GITHUB_API_URL` from the environment. Any failure prints one line and
 * exits non-zero.
 */

import { readFile } from 'node:fs/promises';

import { DEFAULT_GITHUB_API_URL, parseRepoName } from '../config/load.ts';
import { upsertReadinessComment } from './comment.ts';

/** Exit code for a failed post. */
const EXIT_FAILURE = 1;

/**
 * Returns the variable's value.
 *
 * @throws when it is unset or empty.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set`);
  }

  return value;
}

/** Posts the report and resolves to the exit code. */
async function main(argv: string[]): Promise<number> {
  const [reportPath] = argv;
  if (reportPath === undefined || argv.length !== 1) {
    throw new Error('usage: post.ts <report.md>');
  }

  const repo = parseRepoName(requireEnv('GITHUB_REPOSITORY'), 'GITHUB_REPOSITORY');
  const numberText = requireEnv('PR_NUMBER');
  if (!/^[1-9]\d*$/.test(numberText)) {
    throw new Error(`PR_NUMBER must be a positive whole number, got "${numberText}"`);
  }

  const result = await upsertReadinessComment({
    repo,
    number: Number(numberText),
    body: await readFile(reportPath, 'utf8'),
    token: requireEnv('GITHUB_TOKEN'),
    apiUrl: (process.env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(/\/+$/, ''),
  });
  process.stdout.write(
    `${result.action} readiness comment ${result.commentId} on ${repo}#${numberText}\n`,
  );

  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`helm-triage post: ${message}\n`);
  process.exitCode = EXIT_FAILURE;
}
