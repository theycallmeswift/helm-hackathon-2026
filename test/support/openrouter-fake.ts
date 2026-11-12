/**
 * A localhost stand-in for OpenRouter's chat completions endpoint. It records
 * every request and answers each with the next scripted reply, so tests
 * assert on what was sent without touching the network.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** One request the fake received. */
export interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  /** The parsed JSON body. */
  body: unknown;
}

/** One scripted reply: an HTTP status and a raw body. */
export interface ScriptedReply {
  status: number;
  body: string;
  /** Send the status and headers, then drop the connection before the body. */
  dropAfterHeaders?: boolean;
}

/** A running fake server. */
export interface OpenRouterFake {
  /** The base URL to pass as `openRouterUrl`, with no trailing slash. */
  url: string;
  /** Every request received, oldest first. */
  requests: RecordedRequest[];
  /** Queues replies, answered in order; a request with none queued gets HTTP 500. */
  reply: (...replies: ScriptedReply[]) => void;
  close: () => Promise<void>;
}

/** A successful completion whose message content is `content` as JSON. */
export function completionReply(content: unknown): ScriptedReply {
  return {
    status: 200,
    body: JSON.stringify({
      id: 'gen-fake',
      model: 'fake/model',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) } }],
    }),
  };
}

/** Starts the fake on a free localhost port. */
export async function startOpenRouterFake(): Promise<OpenRouterFake> {
  const requests: RecordedRequest[] = [];
  const queue: ScriptedReply[] = [];

  const server = createServer((request, response) => {
    void handle(request, response);
  });

  /** Records one request and sends the next scripted reply. */
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    requests.push({
      method: request.method ?? '',
      path: request.url ?? '',
      authorization: request.headers.authorization,
      body: text === '' ? undefined : JSON.parse(text),
    });

    const reply = queue.shift() ?? { status: 500, body: 'no reply scripted' };
    if (reply.dropAfterHeaders) {
      response.writeHead(reply.status, {
        'content-type': 'application/json',
        'content-length': String(reply.body.length),
      });
      response.flushHeaders();
      response.socket?.destroy();

      return;
    }

    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(reply.body);
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/v1`,
    requests,
    reply: (...replies) => {
      queue.push(...replies);
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
