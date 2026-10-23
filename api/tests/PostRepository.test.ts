import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { PostCreationError } from '../src/errors/PostCreationError';
import { PostRepository } from '../src/repositories/PostRepository';

describe('PostRepository.create', (): void => {
  let database: Database.Database;
  let repository: PostRepository;

  beforeEach((): void => {
    database = new Database(':memory:');
    database.exec(readFileSync('api/schema.sql', 'utf8'));
    repository = new PostRepository(database);
  });

  afterEach((): void => {
    database.close();
  });

  it('returns the persisted post with its generated ID', async (): Promise<void> => {
    const input = { title: 'First post', content: 'Hello world' };

    const post = await repository.create(input);

    expect(post).toEqual({ id: 1, ...input });
    expect(database.prepare('SELECT id, title, content FROM posts').all()).toEqual([post]);
  });

  it('stores quotes and SQL syntax as literal text', async (): Promise<void> => {
    const input = { title: "It's a post", content: "'); DROP TABLE posts; --" };

    const post = await repository.create(input);

    expect(post).toEqual({ id: 1, ...input });
    expect(database.prepare('SELECT COUNT(*) AS count FROM posts').get()).toEqual({ count: 1 });
  });

  it('wraps database failures without exposing them in the message', async (): Promise<void> => {
    database.exec('DROP TABLE posts');

    const creation = repository.create({ title: 'Title', content: 'Content' });

    await expect(creation).rejects.toBeInstanceOf(PostCreationError);
    await expect(creation).rejects.toMatchObject({
      message: 'Unable to create blog post.',
      cause: expect.objectContaining({ message: expect.stringContaining('no such table') }),
    });
  });

  it('rejects blank fields without inserting a post', async (): Promise<void> => {
    const creation = repository.create({ title: '', content: 'Content' });

    await expect(creation).rejects.toBeInstanceOf(PostCreationError);
    expect(database.prepare('SELECT COUNT(*) AS count FROM posts').get()).toEqual({ count: 0 });
  });

  it('rejects an insert that does not return a post', async (): Promise<void> => {
    database.exec('CREATE TRIGGER ignore_posts BEFORE INSERT ON posts BEGIN SELECT RAISE(IGNORE); END');

    const creation = repository.create({ title: 'Title', content: 'Content' });

    await expect(creation).rejects.toBeInstanceOf(PostCreationError);
  });
});
