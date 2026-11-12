import { describe, expect, test } from 'vitest';

import type { CheckStatus } from '../../../src/pr/types.ts';
import { makeFile, makePrSnapshot } from '../../support/pr-snapshot.ts';
import { runCheck } from './run-check.ts';

describe('tests check', () => {
  test.each<{ name: string; paths: string[]; status: CheckStatus; evidence: string[] }>([
    {
      name: 'passes when a Go test file changes',
      paths: ['pkg/action/install.go', 'pkg/action/install_test.go'],
      status: 'pass',
      evidence: ['test file pkg/action/install_test.go'],
    },
    {
      name: 'passes when a file under testdata changes',
      paths: ['pkg/chart/loader.go', 'pkg/chart/testdata/basic/Chart.yaml'],
      status: 'pass',
      evidence: ['test file pkg/chart/testdata/basic/Chart.yaml'],
    },
    {
      name: 'passes when a file under a test directory changes',
      paths: ['pkg/repo/index.go', 'internal/test/ensure/ensure.go'],
      status: 'pass',
      evidence: ['test file internal/test/ensure/ensure.go'],
    },
    {
      name: 'does not treat a file merely named test as a test directory',
      paths: ['cmd/helm/test.go'],
      status: 'warn',
      evidence: ['code without tests cmd/helm/test.go'],
    },
    {
      name: 'warns naming Go files changed without tests',
      paths: ['pkg/action/install.go', 'README.md'],
      status: 'warn',
      evidence: ['code without tests pkg/action/install.go'],
    },
    {
      name: 'reports info when only docs and config change',
      paths: ['README.md', '.github/workflows/build.yml'],
      status: 'info',
      evidence: ['no Go files among 2 changed files'],
    },
  ])('$name', ({ paths, status, evidence }) => {
    const files = paths.map((path) => makeFile({ path }));

    const result = runCheck('tests', makePrSnapshot({ files }));

    expect(result.status).toBe(status);
    expect(result.evidence).toEqual(evidence);
  });
});
