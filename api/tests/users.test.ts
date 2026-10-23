import express from 'express';
import { type Server } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { UserRepository } from '../src/repositories/UserRepository';
import { createUsersRouter } from '../src/routes/users';

describe('GET /users', (): void => {
  let database: DatabaseSync;
  let server: Server;
  let url: string;

  beforeEach(async (): Promise<void> => {
    database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE)');
    const app = express();
    app.use(createUsersRouter(new UserRepository(database)));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected an HTTP server address.');
    }
    url = `http://127.0.0.1:${address.port}/users`;
  });

  afterEach(async (): Promise<void> => {
    await promisify(server.close.bind(server))();
    database.close();
    jest.restoreAllMocks();
  });

  it('returns all users as JSON', async (): Promise<void> => {
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, 'alice@example.com');
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(2, 'bob@example.com');

    const response = await fetch(url);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      { id: 1, email: 'alice@example.com' },
      { id: 2, email: 'bob@example.com' },
    ]);
  });

  it('returns an empty JSON array when there are no users', async (): Promise<void> => {
    const response = await fetch(url);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('logs failures and returns a safe JSON error', async (): Promise<void> => {
    database.exec('DROP TABLE users');
    const log = jest.spyOn(console, 'error').mockImplementation((): void => {});

    const response = await fetch(url);
    const body: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: 'USER_LIST_FAILED', message: 'Unable to fetch users.' },
    });
    expect(log).toHaveBeenCalledWith('Failed to list users.', expect.any(Error));
  });
});
