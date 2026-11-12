import { describe, expect, test } from 'vitest';

import {
  ProtectedRepoError,
  type UpsertOptions,
  upsertReadinessComment,
} from '../../../src/action/comment.ts';
import type { Fetch } from '../../../src/github/client.ts';
import { READINESS_MARKER } from '../../../src/report/markdown.ts';

const API_URL = 'http://github.test';

/** One request the fake received, as `METHOD path` plus its JSON body. */
interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
}

/** A stored issue comment. */
interface FakeComment {
  id: number;
  body: string;
}

/**
 * A stand-in for GitHub's issue comment endpoints on one pull request,
 * implementing `fetch`. It keeps comments in memory and records every request.
 */
function githubCommentsFake(repo: string, number: number, initial: FakeComment[] = []) {
  const comments = [...initial];
  const requests: RecordedRequest[] = [];
  let nextId = 1000;
  const listPath = `/repos/${repo}/issues/${number}/comments`;

  const fakeFetch: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: url.pathname, ...(body === undefined ? {} : { body }) });
    const text = (body as { body?: string } | undefined)?.body ?? '';

    if (method === 'GET' && url.pathname === listPath) {
      return Response.json(comments);
    }
    if (method === 'POST' && url.pathname === listPath) {
      const created = { id: nextId++, body: text };
      comments.push(created);

      return Response.json(created, { status: 201 });
    }
    const patched = comments.find((comment) => url.pathname.endsWith(`/comments/${comment.id}`));
    if (method === 'PATCH' && patched !== undefined) {
      patched.body = text;

      return Response.json(patched);
    }

    return Response.json({ message: `no fake for ${method} ${url.pathname}` }, { status: 404 });
  };

  return { fetch: fakeFetch, comments, requests };
}

/** Upsert options for the test fork's pull request 13; override what a test is about. */
function upsertOptions(overrides: Partial<UpsertOptions>): UpsertOptions {
  return {
    repo: 'theycallmeswift/helm',
    number: 13,
    body: `${READINESS_MARKER}\n\nreport v1\n`,
    token: 'test-token',
    apiUrl: API_URL,
    ...overrides,
  };
}

describe('upsertReadinessComment', () => {
  test('creates one comment when none carries the marker', async () => {
    const github = githubCommentsFake('theycallmeswift/helm', 13, [
      { id: 1, body: 'LGTM from a human' },
    ]);

    const result = await upsertReadinessComment(upsertOptions({ fetch: github.fetch }));

    expect(result.action).toBe('created');
    expect(github.requests.map((request) => request.method)).toEqual(['GET', 'POST']);
    expect(github.comments).toHaveLength(2);
    expect(github.comments[1]?.body).toContain('report v1');
  });

  test('updates the marked comment in place', async () => {
    const github = githubCommentsFake('theycallmeswift/helm', 13, [
      { id: 1, body: 'LGTM from a human' },
      { id: 7, body: `${READINESS_MARKER}\n\nreport v0\n` },
    ]);

    const result = await upsertReadinessComment(upsertOptions({ fetch: github.fetch }));

    expect(result).toEqual({ action: 'updated', commentId: 7 });
    expect(github.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      path: '/repos/theycallmeswift/helm/issues/comments/7',
    });
    expect(github.comments.map((comment) => comment.body)).toEqual([
      'LGTM from a human',
      `${READINESS_MARKER}\n\nreport v1\n`,
    ]);
  });

  test('a re-run updates the comment it created instead of creating a second one', async () => {
    const github = githubCommentsFake('theycallmeswift/helm', 13);
    await upsertReadinessComment(upsertOptions({ fetch: github.fetch }));

    await upsertReadinessComment(
      upsertOptions({ fetch: github.fetch, body: `${READINESS_MARKER}\n\nreport v2\n` }),
    );

    expect(github.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    expect(github.comments).toHaveLength(1);
    expect(github.comments[0]?.body).toContain('report v2');
  });

  test.each(['helm/helm', 'Helm/Helm'])('refuses %s before making any request', async (repo) => {
    const github = githubCommentsFake(repo, 13);

    const upsert = upsertReadinessComment(
      upsertOptions({ fetch: github.fetch, repo: repo as UpsertOptions['repo'] }),
    );

    await expect(upsert).rejects.toThrow(ProtectedRepoError);
    await expect(upsert).rejects.toThrow('refusing to post to helm/helm');
    expect(github.requests).toEqual([]);
  });
});
