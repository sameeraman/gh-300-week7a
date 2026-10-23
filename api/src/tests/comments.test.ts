import Database from 'better-sqlite3';
import express, { type Express } from 'express';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { CommentsError } from '../errors/CommentsError';
import { SqliteCommentsRepository } from '../repositories/comments-repository';
import { createCommentsRouter } from '../routes/comments-routes';

describe('Task comments', (): void => {
  let database: Database.Database;
  let repository: SqliteCommentsRepository;
  let app: Express;
  const collection = '/tasks/1/comments';
  const member = `${collection}/1`;

  beforeEach((): void => {
    database = new Database(':memory:');
    database.exec(readFileSync('api/schema.sql', 'utf8'));
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, 'alice@example.com');
    database.prepare('INSERT INTO tasks (id, title) VALUES (?, ?)').run(1, 'First task');
    database.prepare('INSERT INTO tasks (id, title) VALUES (?, ?)').run(2, 'Second task');
    repository = new SqliteCommentsRepository(database);
    app = express();
    app.use(createCommentsRouter(repository));
  });

  afterEach((): void => {
    database.close();
    jest.restoreAllMocks();
  });

  it('creates, lists, reads, updates, and deletes a persisted comment', async (): Promise<void> => {
    const input = { userId: 1, content: ' First comment ', id: 99, taskId: 2 };

    const created = await request(app).post(collection).send(input);

    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 1, taskId: 1, userId: 1, content: 'First comment' });
    expect(created.headers['x-content-type-options']).toBe('nosniff');
    const listed = await request(app).get(collection);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([created.body]);
    const found = await request(app).get(member);
    expect(found.status).toBe(200);
    expect(found.body).toEqual(created.body);
    const updated = await request(app).put(member).send({ content: ' Updated ', userId: 99, taskId: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ id: 1, taskId: 1, userId: 1, content: 'Updated' });
    expect(await repository.findById(1, 1)).toEqual(updated.body);
    const deleted = await request(app).delete(member);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect(await repository.findById(1, 1)).toBeNull();
  });

  it('returns an empty list for a task without comments', async (): Promise<void> => {
    const response = await request(app).get(collection);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('orders comments and stores SQL-looking content as plain text', async (): Promise<void> => {
    const content = "'); DROP TABLE tasks; --";
    await repository.create(1, { userId: 1, content });
    await repository.create(1, { userId: 1, content: 'Second' });
    await repository.create(2, { userId: 1, content: 'Other task' });

    const response = await request(app).get(collection);

    expect(response.body).toEqual([
      { id: 1, taskId: 1, userId: 1, content },
      { id: 2, taskId: 1, userId: 1, content: 'Second' },
    ]);
  });

  it.each(['get', 'put', 'delete'] as const)('returns 404 for absent comments on %s', async (method): Promise<void> => {
    const response = await request(app)[method](member).send({ content: 'Replacement' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'COMMENT_NOT_FOUND', message: 'Comment not found.' } });
  });

  it.each(['get', 'put', 'delete'] as const)('cannot access another task comment on %s', async (method): Promise<void> => {
    await repository.create(2, { userId: 1, content: 'Private to task two' });

    const response = await request(app)[method](member).send({ content: 'Replacement' });

    expect(response.status).toBe(404);
    expect(await repository.findById(2, 1)).toEqual({ id: 1, taskId: 2, userId: 1, content: 'Private to task two' });
  });

  it.each(['get', 'post'] as const)('returns 404 for missing parent task on %s', async (method): Promise<void> => {
    const response = await request(app)[method]('/tasks/99/comments').send({ userId: 1, content: 'Comment' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('rejects a missing author without inserting a comment', async (): Promise<void> => {
    const response = await request(app).post(collection).send({ userId: 99, content: 'Comment' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
    expect(await repository.findAll(1)).toEqual([]);
  });

  it.each([{}, { userId: 1 }, { content: 'Text' }, { userId: 0, content: 'Text' },
    { userId: {}, content: 'Text' }, { userId: 1.5, content: 'Text' },
    { userId: 1, content: '  ' }, { userId: 1, content: null },
    { userId: 1, content: ['Text'] }, { userId: 1, content: 'x'.repeat(5001) },
  ])('validates creation input %#', async (input: object): Promise<void> => {
    const response = await request(app).post(collection).send(input);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: expect.any(String), message: expect.any(String) }),
    ]));
    expect(await repository.findAll(1)).toEqual([]);
  });

  it.each([{}, { content: false }, { content: '' }, { content: 'x'.repeat(5001) }])(
    'validates update input %#', async (input: object): Promise<void> => {
      await repository.create(1, { userId: 1, content: 'Original' });

      const response = await request(app).put(member).send(input);

      expect(response.status).toBe(400);
      expect(response.body.error.details).toContainEqual({ field: 'content', message: expect.any(String) });
      expect((await repository.findById(1, 1))?.content).toBe('Original');
    },
  );

  it.each([
    ['get', '/tasks/no/comments'], ['post', '/tasks/0/comments'],
    ['get', '/tasks/1/comments/-1'], ['put', '/tasks/1/comments/1.5'],
    ['delete', '/tasks/1/comments/9007199254740992'],
  ] as const)('validates path IDs for %s %s', async (method, path): Promise<void> => {
    const response = await request(app)[method](path).send({ userId: 1, content: 'Text' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts the maximum content length', async (): Promise<void> => {
    const content = 'x'.repeat(5000);

    const response = await request(app).post(collection).send({ userId: 1, content });

    expect(response.status).toBe(201);
    expect(response.body.content).toBe(content);
  });

  it.each([
    ['post', '/tasks/1/comments'], ['get', '/tasks/1/comments'],
    ['get', '/tasks/1/comments/1'], ['put', '/tasks/1/comments/1'], ['delete', '/tasks/1/comments/1'],
  ] as const)('logs and hides storage errors on %s %s', async (method, path): Promise<void> => {
    database.exec('DROP TABLE comments');
    const log = jest.spyOn(console, 'error').mockImplementation((): void => {});

    const response = await request(app)[method](path).send({ userId: 1, content: 'Text' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'COMMENTS_FAILED', message: 'Unable to process comments.' } });
    expect(log).toHaveBeenCalledWith('Failed to process comment request.', expect.any(CommentsError));
  });

  it('returns safe errors for unexpected repository failures', async (): Promise<void> => {
    jest.spyOn(repository, 'findAll').mockRejectedValue(new Error('secret'));
    jest.spyOn(console, 'error').mockImplementation((): void => {});

    const response = await request(app).get(collection);

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('secret');
  });

  it('handles malformed JSON', async (): Promise<void> => {
    const response = await request(app).post(collection).type('json').send('{');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('handles oversized bodies', async (): Promise<void> => {
    const response = await request(app).post(collection).send({ content: 'x'.repeat(110_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it.each([
    { 'Content-Type': 'application/json; charset=unknown' },
    { 'Content-Type': 'application/json', 'Content-Encoding': 'unknown' },
  ])('handles unsupported request encodings %#', async (headers): Promise<void> => {
    const response = await request(app).post(collection).set(headers).send('{}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_ENCODING');
  });

  it('logs corrupt compressed request bodies', async (): Promise<void> => {
    const log = jest.spyOn(console, 'error').mockImplementation((): void => {});

    const response = await request(app).post(collection).set('Content-Encoding', 'gzip').type('json').send('bad gzip');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_BODY');
    expect(log).toHaveBeenCalled();
  });

  it('rate limits all comment routes', async (): Promise<void> => {
    for (let index = 0; index < 60; index += 1) {
      await request(app).get(collection).expect(200);
    }

    const response = await request(app).post(collection).send({ userId: 1, content: 'Rejected' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(await repository.findAll(1)).toEqual([]);
  });

  it('enforces foreign keys, cascades task deletion, and rolls back failed inserts', async (): Promise<void> => {
    await repository.create(1, { userId: 1, content: 'Original' });

    await expect(repository.create(1, { userId: 1, content: '' })).rejects.toBeInstanceOf(CommentsError);

    expect(await repository.findAll(1)).toHaveLength(1);
    expect((): void => { database.prepare('DELETE FROM users WHERE id = ?').run(1); }).toThrow();
    database.prepare('DELETE FROM tasks WHERE id = ?').run(1);
    expect(await repository.findById(1, 1)).toBeNull();
  });

  it('handles an insert suppressed by a database trigger', async (): Promise<void> => {
    database.exec('CREATE TRIGGER ignore_comment BEFORE INSERT ON comments BEGIN SELECT RAISE(IGNORE); END');

    const operation = repository.create(1, { userId: 1, content: 'Text' });

    await expect(operation).rejects.toMatchObject({ code: 'COMMENTS_FAILED' });
    expect(await repository.findAll(1)).toEqual([]);
  });
});