import { existsSync, readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const ACTION_DIR = new URL('../../../', import.meta.url);
/** The event expression `pr-number` defaults to, spelled out so no template literal is implied. */
const PR_EVENT_NUMBER = ['$', '{{ github.event.pull_request.number }}'].join('');

const ACTION_YML = readFileSync(new URL('action.yml', ACTION_DIR), 'utf8');

/** One input as action.yml declares it. */
interface ActionInput {
  required?: string;
  default?: string;
  description?: string;
}

/**
 * Reads the `inputs:` block of an action file: two-space-indented input
 * names, each with four-space-indented `key: value` fields. Enough YAML for
 * this file, so the test needs no parser dependency.
 */
function parseInputs(yaml: string): Record<string, ActionInput> {
  const block = yaml.match(/^inputs:\n((?: {2}.*\n|\n)*)/m)?.[1];
  if (block === undefined) {
    throw new Error('action.yml has no inputs block');
  }

  const inputs: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | undefined;
  for (const line of block.split('\n')) {
    const name = line.match(/^ {2}([\w-]+):$/)?.[1];
    const field = line.match(/^ {4}(\w+): ?(.*)$/);
    if (name !== undefined) {
      current = {};
      inputs[name] = current;
    } else if (field !== null && current !== undefined) {
      const [, key = '', value = ''] = field;
      current[key] = value.replace(/^"(.*)"$/, '$1');
    }
  }

  return inputs;
}

test('action.yml declares the inputs the Action needs', () => {
  const inputs = parseInputs(ACTION_YML);

  expect(Object.keys(inputs).sort()).toEqual(
    ['github-token', 'model', 'openrouter-api-key', 'pr-number'].sort(),
  );
  expect(inputs['github-token']?.required).toBe('true');
  expect(inputs['pr-number']?.default).toBe(PR_EVENT_NUMBER);
  expect(inputs['openrouter-api-key']?.required).toBe('false');
  expect(inputs.model?.required).toBe('false');
  for (const input of Object.values(inputs)) {
    expect(input.description).toBeTruthy();
  }
});

test('action.yml is a composite action that runs files that exist', () => {
  const scripts = [...ACTION_YML.matchAll(/\$ACTION_PATH\/(src\/[\w/.-]+\.ts)/g)].map(
    (match) => match[1] ?? '',
  );

  expect(ACTION_YML).toMatch(/^ {2}using: composite$/m);
  expect(scripts).toEqual(['src/index.ts', 'src/action/post.ts']);
  for (const script of scripts) {
    expect(existsSync(new URL(script, ACTION_DIR))).toBe(true);
  }
});
