/** The tests check: a pull request that changes code also changes tests. */

import type { CheckResult, PrFile, PrSnapshot } from '../pr/types.ts';

const TEST_DIRECTORIES = ['test', 'testdata'];

/** Whether a path is a Go test file or lives under a `test` or `testdata` directory. */
function isTestPath(path: string): boolean {
  const directories = path.split('/').slice(0, -1);
  return path.endsWith('_test.go') || directories.some((name) => TEST_DIRECTORIES.includes(name));
}

/** Whether a file is Go source, the only code whose changes call for tests. */
function isCode(file: PrFile): boolean {
  return file.path.endsWith('.go');
}

/**
 * Passes when a changed file is a test, warns when Go code changed without
 * one, and reports `info` when only docs or other non-code files changed.
 */
export function checkTests(snapshot: PrSnapshot): CheckResult {
  const result = { id: 'tests', title: 'Tests' } as const;
  const testFiles = snapshot.files.filter((file) => isTestPath(file.path));
  const codeFiles = snapshot.files.filter(isCode);

  if (testFiles.length > 0) {
    return {
      ...result,
      status: 'pass',
      summary: `Changes ${testFiles.length} test files.`,
      evidence: testFiles.map((file) => `test file ${file.path}`),
    };
  }

  if (codeFiles.length === 0) {
    return {
      ...result,
      status: 'info',
      summary: 'Only docs or other non-code files changed.',
      evidence: [`no Go files among ${snapshot.files.length} changed files`],
    };
  }

  return {
    ...result,
    status: 'warn',
    summary: 'Go code changed but no test file did.',
    evidence: codeFiles.map((file) => `code without tests ${file.path}`),
  };
}
