import type Database from 'better-sqlite3';
import { PostCreationError } from '../errors/PostCreationError';

export interface Post {
  readonly id: number;
  readonly title: string;
  readonly content: string;
}

export interface CreatePostInput {
  readonly title: string;
  readonly content: string;
}

export class PostRepository {
  /**
   * Creates a repository using a caller-owned connection.
   * @param database - An open database containing the posts table.
   * @returns A PostRepository instance.
   * @throws No errors.
   */
  constructor(private readonly database: Database.Database) {}

  /**
   * Saves a blog post with a single atomic insert.
   * @param input - The validated title and content.
   * @returns The newly persisted post.
   * @throws {PostCreationError} If the insert fails.
   */
  async create(input: CreatePostInput): Promise<Post> {
    try {
      const post = this.database
        .prepare<[string, string], Post>(
          'INSERT INTO posts (title, content) VALUES (?, ?) RETURNING id, title, content',
        )
        .get(input.title, input.content);

      if (post === undefined) {
        throw new Error('Insert did not return a post.');
      }

      return post;
    } catch (cause: unknown) {
      throw new PostCreationError(cause);
    }
  }
}
