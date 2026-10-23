export class PostCreationError extends Error {
  /**
   * Creates an error with a safe public message.
   * @param cause - The underlying database error.
   * @returns A PostCreationError instance.
   * @throws No errors.
   */
  constructor(cause: unknown) {
    super('Unable to create blog post.', { cause });
    this.name = 'PostCreationError';
  }
}
