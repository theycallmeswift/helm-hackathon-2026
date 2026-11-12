/**
 * A localhost stand-in for the GitHub REST API that serves recorded
 * responses, so tests point `HELM_TRIAGE_GITHUB_API_URL` at it and run with
 * no network. Requests it has no recording for get a 501 naming the request.
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import type { Recording } from '../../src/github/recording.ts';

/** Where the recorder writes fixtures, one file per pull request. */
export const RECORDED_DIR = new URL('../fixtures/recorded/', import.meta.url).pathname;

/** A running replay server. */
export interface GithubReplay {
  /** Base URL to use as the GitHub API URL, with no trailing slash. */
  url: string;
  /** Every request served, as `GET <path>`, in order. */
  requests: string[];
  /** Stops the server. */
  close(): Promise<void>;
}

/** Reads one recorded fixture file by name, such as `pr-1.json`. */
export function loadRecording(fileName: string): Recording {
  return JSON.parse(readFileSync(join(RECORDED_DIR, fileName), 'utf8')) as Recording;
}

/**
 * Starts a server on a free localhost port answering from `recording`. A key
 * with several responses answers them in turn, then repeats the last.
 */
export async function startGithubReplay(recording: Recording): Promise<GithubReplay> {
  const requests: string[] = [];
  const served = new Map<string, number>();

  const server = createServer((request, response) => {
    const key = `${request.method} ${request.url}`;
    requests.push(key);
    const responses = recording[key];
    if (responses === undefined || responses.length === 0) {
      response.writeHead(501, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: `no recording for ${key}` }));

      return;
    }

    const count = served.get(key) ?? 0;
    served.set(key, count + 1);
    const recorded = responses[Math.min(count, responses.length - 1)];
    if (recorded === undefined) {
      throw new Error(`recording for ${key} is empty`);
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (const [name, value] of Object.entries(recorded.headers)) {
      headers[name] = name === 'link' ? value.replaceAll('<', `<${baseUrl()}`) : value;
    }
    response.writeHead(recorded.status, headers);
    response.end(recorded.body === null ? '' : JSON.stringify(recorded.body));
  });

  /** The server's own base URL, for absolute `link` headers. */
  function baseUrl(): string {
    const { port } = server.address() as AddressInfo;

    return `http://127.0.0.1:${port}`;
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: baseUrl(),
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      ),
  };
}
