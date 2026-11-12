#!/usr/bin/env node
/**
 * The `helm-triage` command line: parses global options, then hands the
 * remaining arguments to the named command. This is the user-facing
 * boundary, so it turns any thrown error into one line and a failing exit
 * code.
 */

import { parseArgs } from 'node:util';

import { runPrCommand } from './pr/command.ts';

/** One subcommand. */
interface Command {
  /** One line for the usage text. */
  summary: string;
  /** Runs the command with the arguments after its name and resolves to the exit code. */
  run: (args: string[]) => Promise<number>;
}

/** Options accepted before the command name. */
const GLOBAL_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
} as const;

/** Exit code for a usage mistake or a failed run. */
const EXIT_FAILURE = 1;

/** Every command, by the name a user types. */
const COMMANDS: Record<string, Command> = {
  pr: {
    summary: 'Print a readiness report for one pull request',
    run: (args) => runPrCommand(args, process.env),
  },
  queue: {
    summary: 'Sort every open pull request by who must act next',
    run: () => notImplemented('queue'),
  },
};

/** Reports that a command exists but does nothing yet. */
async function notImplemented(commandName: string): Promise<number> {
  process.stderr.write(`helm-triage ${commandName}: not implemented yet\n`);

  return EXIT_FAILURE;
}

/** The usage text listing every command. */
function usage(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  const commandLines = Object.entries(COMMANDS).map(
    ([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`,
  );

  return [
    'Usage: helm-triage <command> [options]',
    '',
    'Commands:',
    ...commandLines,
    '',
    'Options:',
    '  -h, --help  Show this help',
    '',
  ].join('\n');
}

/**
 * Splits `argv` at the first positional argument: what precedes it are
 * global options, it names the command, and the rest belong to the command.
 */
function splitAtCommand(argv: string[]): {
  globalArgs: string[];
  commandName?: string;
  commandArgs: string[];
} {
  const { tokens } = parseArgs({
    args: argv,
    options: GLOBAL_OPTIONS,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const commandToken = tokens.find((token) => token.kind === 'positional');
  if (commandToken === undefined) {
    return { globalArgs: argv, commandArgs: [] };
  }

  return {
    globalArgs: argv.slice(0, commandToken.index),
    commandName: commandToken.value,
    commandArgs: argv.slice(commandToken.index + 1),
  };
}

/** Runs the command line `argv` (without the node and script paths) and resolves to the exit code. */
async function main(argv: string[]): Promise<number> {
  const { globalArgs, commandName, commandArgs } = splitAtCommand(argv);
  const { values } = parseArgs({ args: globalArgs, options: GLOBAL_OPTIONS, strict: true });

  if (values.help) {
    process.stdout.write(usage());

    return 0;
  }

  const command = commandName === undefined ? undefined : COMMANDS[commandName];
  if (command === undefined) {
    const problem =
      commandName === undefined ? 'missing command' : `unknown command "${commandName}"`;
    process.stderr.write(`helm-triage: ${problem}\n\n${usage()}`);

    return EXIT_FAILURE;
  }

  return command.run(commandArgs);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`helm-triage: ${message}\n`);
  process.exitCode = EXIT_FAILURE;
}
