import type Database from 'better-sqlite3';
import { CommentsError } from '../errors/CommentsError';
import type { Comment, CommentsRepository, CreateCommentInput, UpdateCommentInput } from '../types/comments';

export class SqliteCommentsRepository implements CommentsRepository {
  /**
   * Creates a repository using a caller-owned connection with foreign keys enabled.
   * @param database - An initialized SQLite database.
   * @returns A comments repository.
   * @throws No errors.
   */
  constructor(private readonly database: Database.Database) {}

  /**
   * Inserts a comment atomically with reference checks.
   * @param taskId - Parent task ID.
   * @param input - Author and content.
   * @returns The persisted comment.
   * @throws {CommentsError} If references are missing or storage fails.
   */
  async create(taskId: number, input: CreateCommentInput): Promise<Comment> {
    return this.run((): Comment => this.database.transaction((): Comment => {
      // Why: keep reference checks and insertion atomic so a parent cannot disappear between them.
      this.requireTask(taskId);
      if (this.database.prepare('SELECT id FROM users WHERE id = ?').get(input.userId) === undefined) {
        throw new CommentsError('USER_NOT_FOUND', 'User not found.');
      }
      const comment = this.database.prepare<[number, number, string], Comment>(
        'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?) RETURNING id, task_id AS taskId, user_id AS userId, content',
      ).get(taskId, input.userId, input.content);
      if (comment === undefined) {
        throw new CommentsError('COMMENTS_FAILED', 'Unable to save comment.');
      }
      return comment;
    })());
  }

  /**
   * Lists comments for an existing task.
   * @param taskId - Parent task ID.
   * @returns Comments in ID order.
   * @throws {CommentsError} If the task is missing or storage fails.
   */
  async findAll(taskId: number): Promise<Comment[]> {
    return this.run((): Comment[] => this.database.transaction((): Comment[] => {
      this.requireTask(taskId);
      return this.database.prepare<[number], Comment>(
        'SELECT id, task_id AS taskId, user_id AS userId, content FROM comments WHERE task_id = ? ORDER BY id',
      ).all(taskId);
    })());
  }

  /**
   * Finds a comment scoped to a task.
   * @param taskId - Parent task ID.
   * @param id - Comment ID.
   * @returns The comment or null.
   * @throws {CommentsError} If storage fails.
   */
  async findById(taskId: number, id: number): Promise<Comment | null> {
    return this.run((): Comment | null => this.database.prepare<[number, number], Comment>(
      'SELECT id, task_id AS taskId, user_id AS userId, content FROM comments WHERE task_id = ? AND id = ?',
    ).get(taskId, id) ?? null);
  }

  /**
   * Replaces comment content.
   * @param taskId - Parent task ID.
   * @param id - Comment ID.
   * @param input - Replacement content.
   * @returns The updated comment or null.
   * @throws {CommentsError} If storage fails.
   */
  async update(taskId: number, id: number, input: UpdateCommentInput): Promise<Comment | null> {
    return this.run((): Comment | null => this.database.prepare<[string, number, number], Comment>(
      'UPDATE comments SET content = ? WHERE task_id = ? AND id = ? RETURNING id, task_id AS taskId, user_id AS userId, content',
    ).get(input.content, taskId, id) ?? null);
  }

  /**
   * Deletes a comment scoped to a task.
   * @param taskId - Parent task ID.
   * @param id - Comment ID.
   * @returns Whether a comment was deleted.
   * @throws {CommentsError} If storage fails.
   */
  async delete(taskId: number, id: number): Promise<boolean> {
    return this.run((): boolean => this.database.prepare(
      'DELETE FROM comments WHERE task_id = ? AND id = ?',
    ).run(taskId, id).changes > 0);
  }

  private requireTask(taskId: number): void {
    if (this.database.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) === undefined) {
      throw new CommentsError('TASK_NOT_FOUND', 'Task not found.');
    }
  }

  private run<Result>(operation: () => Result): Result {
    try {
      return operation();
    } catch (cause: unknown) {
      if (cause instanceof CommentsError) {
        throw cause;
      }
      throw new CommentsError('COMMENTS_FAILED', 'Unable to process comments.', cause);
    }
  }
}