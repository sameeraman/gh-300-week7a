export interface Comment {
  readonly id: number;
  readonly taskId: number;
  readonly userId: number;
  readonly content: string;
}

export interface CreateCommentInput {
  readonly userId: number;
  readonly content: string;
}

export interface UpdateCommentInput {
  readonly content: string;
}

export interface CommentsRepository {
  /**
   * Persists a comment on an existing task by an existing user.
   * @param taskId - The parent task ID.
   * @param input - Validated author and content.
   * @returns The created comment.
   * @throws {CommentsError} If a reference is missing or persistence fails.
   */
  create(taskId: number, input: CreateCommentInput): Promise<Comment>;
  /**
   * Lists a task's comments in ID order.
   * @param taskId - The parent task ID.
   * @returns Comments, including an empty array for an uncommented task.
   * @throws {CommentsError} If the task is missing or querying fails.
   */
  findAll(taskId: number): Promise<Comment[]>;
  /**
   * Finds a comment within its task.
   * @param taskId - The parent task ID.
   * @param id - The comment ID.
   * @returns The matching comment or null.
   * @throws {CommentsError} If querying fails.
   */
  findById(taskId: number, id: number): Promise<Comment | null>;
  /**
   * Replaces a comment's content without changing its author or task.
   * @param taskId - The parent task ID.
   * @param id - The comment ID.
   * @param input - Validated replacement content.
   * @returns The updated comment or null when absent.
   * @throws {CommentsError} If persistence fails.
   */
  update(taskId: number, id: number, input: UpdateCommentInput): Promise<Comment | null>;
  /**
   * Deletes a comment within its task.
   * @param taskId - The parent task ID.
   * @param id - The comment ID.
   * @returns Whether a comment was deleted.
   * @throws {CommentsError} If deletion fails.
   */
  delete(taskId: number, id: number): Promise<boolean>;
}