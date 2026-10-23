export class UserListError extends Error {
  /**
   * Creates a user listing error with a safe public message.
   * @param cause - The underlying database or row validation error.
   * @returns A UserListError instance.
   * @throws No errors.
   */
  constructor(cause: unknown) {
    super('Unable to fetch users.', { cause });
    this.name = 'UserListError';
  }
}

export class InvalidEmailError extends Error {
  /**
   * Creates an error for a blank email address.
   * @returns An InvalidEmailError instance.
   * @throws No errors.
   */
  constructor() {
    super('Email address must not be blank.');
    this.name = 'InvalidEmailError';
  }
}

export class UserLookupError extends Error {
  /**
   * Creates a database lookup error without exposing database details in its message.
   * @param cause - The underlying database or row validation error.
   * @returns A UserLookupError instance.
   * @throws No errors.
   */
  constructor(cause: unknown) {
    super('Unable to fetch user by email.', { cause });
    this.name = 'UserLookupError';
  }
}
