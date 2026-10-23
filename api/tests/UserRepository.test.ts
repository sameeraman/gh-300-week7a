import { DatabaseSync } from 'node:sqlite';
import { InvalidEmailError, UserListError, UserLookupError } from '../src/errors/UserLookupError';
import { UserRepository } from '../src/repositories/UserRepository';

describe('UserRepository.findByEmail', (): void => {
  let database: DatabaseSync;
  let repository: UserRepository;

  beforeEach((): void => {
    database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE)');
    repository = new UserRepository(database);
  });

  describe('UserRepository.findAll', (): void => {
    let database: DatabaseSync;
    let repository: UserRepository;

    beforeEach((): void => {
      database = new DatabaseSync(':memory:');
      database.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE)');
      repository = new UserRepository(database);
    });

    afterEach((): void => {
      database.close();
    });

    it('returns every user ordered by ID', async (): Promise<void> => {
      const insert = database.prepare('INSERT INTO users (id, email) VALUES (?, ?)');
      insert.run(2, 'bob@example.com');
      insert.run(1, 'alice@example.com');

      const users = await repository.findAll();

      expect(users).toEqual([
        { id: 1, email: 'alice@example.com' },
        { id: 2, email: 'bob@example.com' },
      ]);
    });

    it('returns an empty array for an empty table', async (): Promise<void> => {
      const users = await repository.findAll();

      expect(users).toEqual([]);
    });

    it('wraps database failures and preserves the cause', async (): Promise<void> => {
      database.exec('DROP TABLE users');

      const lookup = repository.findAll();

      await expect(lookup).rejects.toBeInstanceOf(UserListError);
      await expect(lookup).rejects.toMatchObject({
        message: 'Unable to fetch users.',
        cause: expect.objectContaining({ message: expect.stringContaining('no such table') }),
      });
    });

    it('rejects malformed rows instead of returning partial results', async (): Promise<void> => {
      database.exec('DROP TABLE users; CREATE TABLE users (id, email)');
      database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, null);

      const lookup = repository.findAll();

      await expect(lookup).rejects.toBeInstanceOf(UserListError);
    });
  });

  afterEach((): void => {
    database.close();
  });

  it('returns the matching user without unrelated fields', async (): Promise<void> => {
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, 'alice@example.com');
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(2, 'bob@example.com');

    const user = await repository.findByEmail('bob@example.com');

    expect(user).toEqual({ id: 2, email: 'bob@example.com' });
  });

  it('returns null when no user matches', async (): Promise<void> => {
    const user = await repository.findByEmail('missing@example.com');

    expect(user).toBeNull();
  });

  it.each(['', '   ', '\t\n'])('rejects blank email %j', async (email: string): Promise<void> => {
    await expect(repository.findByEmail(email)).rejects.toBeInstanceOf(InvalidEmailError);
  });

  it('treats SQL injection text as a literal value', async (): Promise<void> => {
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, 'alice@example.com');

    const user = await repository.findByEmail("' OR 1=1 --");

    expect(user).toBeNull();
  });

  it('finds email addresses containing an apostrophe', async (): Promise<void> => {
    const email = "o'connor@example.com";
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, email);

    const user = await repository.findByEmail(email);

    expect(user).toEqual({ id: 1, email });
  });

  it.each(['ALICE@example.com', ' alice@example.com '])(
    'does not normalize the input %j',
    async (email: string): Promise<void> => {
      database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(1, 'alice@example.com');

      const user = await repository.findByEmail(email);

      expect(user).toBeNull();
    },
  );

  it('wraps database failures with a safe message and preserves the cause', async (): Promise<void> => {
    database.exec('DROP TABLE users');

    const lookup = repository.findByEmail('alice@example.com');

    await expect(lookup).rejects.toBeInstanceOf(UserLookupError);
    await expect(lookup).rejects.toMatchObject({
      name: 'UserLookupError',
      message: 'Unable to fetch user by email.',
      cause: expect.objectContaining({ message: expect.stringContaining('no such table') }),
    });
  });

  it.each([
    ['invalid-id', 'alice@example.com'],
    [1.5, 'alice@example.com'],
    [9007199254740992, 'alice@example.com'],
  ])('rejects malformed user rows (%j, %j)', async (id: string | number, email: string): Promise<void> => {
    database.exec('DROP TABLE users; CREATE TABLE users (id, email)');
    database.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, email);
    const lookup = repository.findByEmail(email);

    await expect(lookup).rejects.toBeInstanceOf(UserLookupError);
  });
});
