import Database from 'better-sqlite3';
import express from 'express';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { type Server } from 'node:http';
import { promisify } from 'node:util';
import { PostRepository } from '../src/repositories/PostRepository';
import { createPostsRouter } from '../src/routes/test-routes';

describe('POST /posts', (): void => {
  let database: Database.Database;
  let server: Server;
  let url: string;

  beforeEach(async (): Promise<void> => {
    database = new Database(':memory:');
    database.exec(readFileSync('api/schema.sql', 'utf8'));
    const app = express();
    app.use(createPostsRouter(new PostRepository(database)));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected an HTTP server address.');
    }
    url = `http://127.0.0.1:${address.port}/posts`;
  });

  afterEach(async (): Promise<void> => {
    await promisify(server.close.bind(server))();
    database.close();
    jest.restoreAllMocks();
  });

  it('creates and persists a post, trimming fields and ignoring extra properties', async (): Promise<void> => {
    const input = { title: ' First post ', content: ' Hello world ', id: 999 };

    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const post: unknown = await response.json();

    expect(response.status).toBe(201);
    expect(post).toEqual({ id: 1, title: 'First post', content: 'Hello world' });
    expect(database.prepare('SELECT * FROM posts').all()).toEqual([post]);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it.each([
    {},
    { title: 'Title' },
    { content: 'Content' },
    { title: ' ', content: 'Content' },
    { title: 'Title', content: '\t\n' },
    { title: 123, content: 'Content' },
    { title: 'Title', content: null },
    { title: ['Title'], content: 'Content' },
  ])('rejects invalid fields: %j', async (input: object): Promise<void> => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const result: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(result).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: expect.arrayContaining([expect.objectContaining({
          field: expect.stringMatching(/^(title|content)$/), message: expect.any(String),
        })]),
      },
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM posts').get()).toEqual({ count: 0 });
  });

  it('returns a JSON error for malformed JSON', async (): Promise<void> => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    });
  });

  it('rejects oversized bodies with a JSON error', async (): Promise<void> => {
    const input = { title: 'Title', content: 'x'.repeat(110_000) };

    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 100 KB limit.' },
    });
  });

  it('logs database failures and returns a safe error', async (): Promise<void> => {
    database.exec('DROP TABLE posts');
    const log = jest.spyOn(console, 'error').mockImplementation((): void => {});

    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Title', content: 'Content' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'POST_CREATION_FAILED', message: 'Unable to create blog post.' },
    });
    expect(log).toHaveBeenCalledWith('Failed to create blog post.', expect.any(Error));
  });

  it.each<Record<string, string>>([
    { 'Content-Type': 'application/json; charset=unknown' },
    { 'Content-Type': 'application/json', 'Content-Encoding': 'unknown' },
  ])('rejects unsupported encodings: %j', async (headers: Record<string, string>): Promise<void> => {
    const response = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify({ title: 'Title', content: 'Content' }),
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: { code: 'UNSUPPORTED_ENCODING', message: 'Request encoding is not supported.' },
    });
  });

  it('logs unreadable compressed bodies and returns a safe JSON error', async (): Promise<void> => {
    const log = jest.spyOn(console, 'error').mockImplementation((): void => {});

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: 'not compressed',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_BODY', message: 'Unable to read request body.' },
    });
    expect(log).toHaveBeenCalledWith(
      'Failed to read blog post request.', expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('limits a client to 60 requests per minute without inserting the rejected post', async (): Promise<void> => {
    const request = {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Title', content: 'Content' }),
    };
    for (let index = 0; index < 60; index += 1) {
      const response = await fetch(url, request);
      expect(response.status).toBe(201);
      await response.json();
    }

    const response = await fetch(url, request);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' },
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM posts').get()).toEqual({ count: 60 });
  });
});
