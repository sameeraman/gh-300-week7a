import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { InvalidEmailError, UserListError, UserLookupError } from '../errors/UserLookupError';

export interface User {
  readonly id: number;
  readonly email: string;
}

export class UserRepository {
  /**
   * Creates a repository using a caller-owned SQLite connection.
   * @param database - An open database containing the users table.
   * @returns A UserRepository instance.
   * @throws No errors.
   */
  constructor(private readonly database: DatabaseSync) {}

  /**
   * Lists all users in ascending ID order.
   * @returns All users, or an empty array when the table is empty.
   * @throws {UserListError} If querying fails or a returned row is invalid.
   */
  async findAll(): Promise<User[]> {
    try {
      const rows = this.database.prepare('SELECT id, email FROM users ORDER BY id').all();
      return rows.map((row): User => this.parseUser(row));
    } catch (cause: unknown) {
      throw new UserListError(cause);
    }
  }

  /**
   * Finds a user by their exact email address.
   * @param email - A nonblank email address; case and whitespace are preserved.
   * @returns The matching user, or null if no user matches.
   * @throws {InvalidEmailError} If the email is blank.
   * @throws {UserLookupError} If querying fails or the returned row is invalid.
   */
  async findByEmail(email: string): Promise<User | null> {
    if (email.trim().length === 0) {
      throw new InvalidEmailError();
    }

    try {
      const row = this.database
        .prepare('SELECT id, email FROM users WHERE email = ? COLLATE BINARY LIMIT 1')
        .get(email);

      if (row === undefined) {
        return null;
      }

      return this.parseUser(row);
    } catch (cause: unknown) {
      throw new UserLookupError(cause);
    }
  }

  private parseUser(row: Record<string, SQLOutputValue>): User {
    if (
      typeof row.id !== 'number' ||
      !Number.isSafeInteger(row.id) ||
      typeof row.email !== 'string'
    ) {
      throw new Error('Invalid user row.');
    }

    return { id: row.id, email: row.email };
  }
}
