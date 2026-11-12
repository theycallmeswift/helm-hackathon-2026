/** The DCO check: every non-merge commit carries a `Signed-off-by:` trailer. */

import type { CheckResult, PrCommit, PrSnapshot } from '../pr/types.ts';
import { shortSha } from './context.ts';

const SIGN_OFF_TRAILER = /^Signed-off-by:\s*.*?<([^>]+)>\s*$/gim;

/** The emails of every `Signed-off-by:` trailer in a commit message, lowercased. */
function signOffEmails(message: string): string[] {
  return [...message.matchAll(SIGN_OFF_TRAILER)].map((match) => (match[1] ?? '').toLowerCase());
}

/** Whether a commit signs off as its own author. */
function signsOffAsAuthor(commit: PrCommit): boolean {
  return signOffEmails(commit.message).includes(commit.authorEmail.toLowerCase());
}

/**
 * Fails when a non-merge commit has no sign-off, and warns when a sign-off
 * names a different email than the commit's author.
 */
export function checkDco(snapshot: PrSnapshot): CheckResult {
  const commits = snapshot.commits.filter((commit) => !commit.isMerge);
  const unsigned = commits.filter((commit) => signOffEmails(commit.message).length === 0);
  const mismatched = commits.filter(
    (commit) => signOffEmails(commit.message).length > 0 && !signsOffAsAuthor(commit),
  );
  const result = { id: 'dco', title: 'DCO' } as const;

  if (commits.length === 0) {
    return { ...result, status: 'info', summary: 'No non-merge commits to check.', evidence: [] };
  }

  if (unsigned.length > 0) {
    return {
      ...result,
      status: 'fail',
      summary: `${unsigned.length} of ${commits.length} commits lack a Signed-off-by trailer.`,
      evidence: unsigned.map((commit) => `${shortSha(commit.sha)}: no Signed-off-by trailer`),
    };
  }

  if (mismatched.length > 0) {
    return {
      ...result,
      status: 'warn',
      summary: `${mismatched.length} of ${commits.length} commits sign off as someone other than their author.`,
      evidence: mismatched.map(
        (commit) =>
          `${shortSha(commit.sha)}: signed off as ${signOffEmails(commit.message).join(', ')}, authored by ${commit.authorEmail}`,
      ),
    };
  }

  return {
    ...result,
    status: 'pass',
    summary: `All ${commits.length} commits are signed off.`,
    evidence: commits.map(
      (commit) => `${shortSha(commit.sha)}: signed off by ${commit.authorEmail}`,
    ),
  };
}
