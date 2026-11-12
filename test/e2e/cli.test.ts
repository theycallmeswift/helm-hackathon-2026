import { spawnSync } from 'node:child_process';

import { describe, expect, test } from 'vitest';

const ENTRY_POINT = new URL('../../src/index.ts', import.meta.url).pathname;

/** What a finished run of the CLI printed and exited with. */
interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs the real entry point with `args` and no credentials. */
function runCli(args: string[]): CliRun {
  const result = spawnSync(process.execPath, [ENTRY_POINT, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  if (result.status === null) {
    throw new Error(`helm-triage ${args.join(' ')} was killed by ${result.signal}`);
  }

  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('helm-triage', () => {
  test('--help lists the pr and queue commands', () => {
    const run = runCli(['--help']);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^Usage: helm-triage <command>/);
    expect(run.stdout).toMatch(/^ {2}pr\b/m);
    expect(run.stdout).toMatch(/^ {2}queue\b/m);
  });

  test('an unknown command prints usage and fails', () => {
    const run = runCli(['frobnicate']);

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain('unknown command "frobnicate"');
    expect(run.stderr).toContain('Usage: helm-triage');
  });

  test('no command prints usage and fails', () => {
    const run = runCli([]);

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain('missing command');
  });

  test('an unknown global option fails with one line', () => {
    const run = runCli(['--frobnicate', 'pr']);

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toMatch(/^helm-triage: .*--frobnicate.*\n$/);
  });

  test('queue says it is not implemented yet and fails', () => {
    const run = runCli(['queue']);

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toBe('helm-triage queue: not implemented yet\n');
  });
});
