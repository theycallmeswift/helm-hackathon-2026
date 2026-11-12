import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const WORKFLOW = readFileSync(
  new URL('../../../docs/demo/helm-triage-dashboard.yml', import.meta.url),
  'utf8',
);

/**
 * The top-level `key: value` pairs nested under `block:`, two spaces deep.
 * Enough YAML for this file, so the test needs no parser dependency.
 */
function topLevelMap(yaml: string, block: string): Record<string, string> {
  const body = yaml.match(new RegExp(`^${block}:\\n((?: {2}.*\\n|\\n)*)`, 'm'))?.[1];
  if (body === undefined) {
    throw new Error(`the workflow has no ${block} block`);
  }

  return Object.fromEntries(
    [...body.matchAll(/^ {2}([\w-]+):(.*)$/gm)].map(([, key = '', value = '']) => [
      key,
      value.trim(),
    ]),
  );
}

/**
 * The lines that are not a comment, a `- ` list item, or a `key:` entry at an
 * even indent, skipping the text of `|` block scalars. A structural check in
 * place of a YAML parser, which the project does not depend on.
 */
function malformedYamlLines(yaml: string): string[] {
  const malformed: string[] = [];
  let blockIndent: number | undefined;
  for (const line of yaml.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (line.trim() === '' || (blockIndent !== undefined && indent >= blockIndent)) {
      continue;
    }

    blockIndent = undefined;
    if (!/^(?: {2})*(?:#.*|- .+|(?:- )?[\w-]+:(?: .+)?)$/.test(line) || line.includes('\t')) {
      malformed.push(line);
    }
    if (/: \|$/.test(line)) {
      blockIndent = indent + 2;
    }
  }

  return malformed;
}

test('the dashboard workflow is well-formed YAML: two-space indents, every line a key, item, comment, or block text', () => {
  const malformed = malformedYamlLines(WORKFLOW);

  expect(malformed).toEqual([]);
});

test('the dashboard workflow asks only for read permissions plus Pages', () => {
  const permissions = topLevelMap(WORKFLOW, 'permissions');

  const writes = Object.entries(permissions).filter(([, level]) => level !== 'read');

  expect(writes).toEqual([
    ['pages', 'write'],
    ['id-token', 'write'],
  ]);
});

test('the dashboard workflow runs hourly or on demand, only on the fork', () => {
  const triggers = topLevelMap(WORKFLOW, 'on');

  expect(Object.keys(triggers)).toEqual(['schedule', 'workflow_dispatch']);
  expect(WORKFLOW).toMatch(/- cron: ["']\d+ \* \* \* \*["']/);
  expect(WORKFLOW).toContain("if: github.repository == 'theycallmeswift/helm'");
  expect(WORKFLOW).toContain('--format html --ai > site/index.html');
});

test('no job-level env reads the runner context, which Actions rejects there', () => {
  const jobEnvBlocks = [...WORKFLOW.matchAll(/^ {4}env:\n((?: {6}.*\n)*)/gm)].map(
    ([, block = '']) => block,
  );

  expect(jobEnvBlocks.filter((block) => block.includes('runner.'))).toEqual([]);
});
