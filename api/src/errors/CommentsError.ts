export class CommentsError extends Error {
  /**
   * Creates a safe comments error with an optional internal cause.
   * @param code - The public failure code.
   * @param message - A safe description.
   * @param cause - Internal diagnostics, never serialized.
   * @returns A comments error.
   * @throws No errors.
   */
  constructor(
    readonly code: 'TASK_NOT_FOUND' | 'USER_NOT_FOUND' | 'COMMENTS_FAILED',
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'CommentsError';
  }
}