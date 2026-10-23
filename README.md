# User lookup by email

Minimal strict TypeScript repository using Node.js 24+ and its built-in
`node:sqlite` driver. SQLite support is experimental in some Node.js 24 releases.
Includes Express routers for listing users and creating blog posts.

## Setup and validation

```sh
npm install
npm run typecheck
npm run build
npm test -- --runInBand --coverage
```

## Usage

The caller owns the database connection and must close it after use.
The existing database must contain a `users` table with a safe-integer `id`
and a non-null, unique text `email`, for example:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);
```

```typescript
import { DatabaseSync } from 'node:sqlite';
import { UserRepository } from './api/src/repositories/UserRepository';

const database = new DatabaseSync('app.sqlite');
const repository = new UserRepository(database);

async function main(): Promise<void> {
  try {
    const user = await repository.findByEmail('alice@example.com');
    console.log(user); // { id, email }, or null if not found
  } finally {
    database.close();
  }
}

void main();
```

`findByEmail` uses parameterized SQL and exact, case-sensitive matching. It does
not trim or lowercase the lookup value. Blank input throws `InvalidEmailError`;
database failures or malformed rows throw `UserLookupError`, preserving the
underlying cause for internal diagnostics. Do not serialize error causes in
API responses.

## List all users

`UserRepository.findAll()` returns an array of `{ id, email }` records ordered
by ID, or `[]` for an empty table. Query or row validation failures throw
`UserListError`.

Mount the provided router in an Express application:

```typescript
import express from 'express';
import { createUsersRouter } from './api/src/routes/users';

const app = express();
app.use(createUsersRouter(repository));
```

`GET /users` returns the user array, or HTTP 500 with
`{ "error": { "code": "USER_LIST_FAILED", "message": "Unable to fetch users." } }`.
Failures are logged server-side without exposing database details in responses.
Add your application's authentication and authorization middleware before
mounting this router. It returns all users without pagination.

Database access stays in the repository. The SQLite driver's `db.exec()` does
not return rows; the listing uses a prepared statement's `.all()` method.

## Create a blog post

Initialize the posts table using [api/schema.sql](api/schema.sql) once before
serving requests, then mount the router:

```typescript
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { PostRepository } from './api/src/repositories/PostRepository';
import { createPostsRouter } from './api/src/routes/test-routes';

const postsDatabase = new Database('app.sqlite');
postsDatabase.exec(readFileSync('api/schema.sql', 'utf8'));
app.use(createPostsRouter(new PostRepository(postsDatabase)));
```

The caller owns and closes `postsDatabase`. This new repository uses
`better-sqlite3` as required by the API-specific instructions; the existing
user repository's built-in driver is unchanged.

`POST /posts` accepts JSON `{ "title": "First post", "content": "Hello world" }`
and returns HTTP 201 with `{ "id": 1, "title": "First post", "content": "Hello world" }`.
Both fields must be strings and nonblank after trimming; extra fields are ignored.
Values are stored as plain text using bound SQL parameters, not HTML-escaped.
Clients must render them as text or sanitize HTML before rendering.

The router includes JSON parsing (100 KB limit), Helmet security headers and an
in-memory rate limit of 60 requests per minute per client IP. Configure Express's
`trust proxy` for your actual proxy topology when deploying behind a proxy; use
a shared rate-limit store for multiple application instances. Mount application
authentication and authorization middleware before this router.

Errors use `{ "error": { "code": "...", "message": "..." } }`:
- HTTP 400 `VALIDATION_ERROR` includes a `details` array of `{ field, message }`.
- HTTP 400 `INVALID_JSON` indicates malformed JSON.
- HTTP 400 `INVALID_BODY` indicates an unreadable body (for example, corrupt compression).
- HTTP 413 `PAYLOAD_TOO_LARGE` indicates the JSON body limit was exceeded.
- HTTP 415 `UNSUPPORTED_ENCODING` indicates an unsupported charset or content encoding.
- HTTP 429 `RATE_LIMIT_EXCEEDED` indicates throttling.
- HTTP 500 `POST_CREATION_FAILED` logs the database error server-side without
  disclosing it in the response.

## Blog post form

Render the named `CreatePostForm` component from
[frontend/test-component.tsx](frontend/test-component.tsx) in a React application:

```tsx
import { CreatePostForm } from './frontend/test-component';

<CreatePostForm />
```

The component requires React and a bundler that supports CSS Modules. It submits
trimmed `title` and `content` as JSON to same-origin `POST /posts`; serve or proxy
that path to the mounted posts router. It validates blank fields, associates
errors with labeled inputs, disables the form while submitting, and announces
success or failure. Failed submissions preserve the draft for retry; HTTP 201
clears it. No HTML from the API is injected into the page.

`npm run build` and `npm run typecheck` include the component; tests use Jest,
jsdom, and React Testing Library. This workspace provides the component, not
a standalone frontend application or development server.

## Task comments

Comments support create, list, read, update, and delete operations scoped to a
task. Initialize [api/schema.sql](api/schema.sql) on the caller-owned
`better-sqlite3` connection before mounting the router:

```typescript
import { SqliteCommentsRepository } from './api/src/repositories/comments-repository';
import { createCommentsRouter } from './api/src/routes/comments-routes';

app.use(createCommentsRouter(new SqliteCommentsRepository(postsDatabase)));
```

The schema adds `users`, `tasks`, and `comments` tables if absent and enables
foreign keys on that connection. Existing user tables must have a primary-key
`id` compatible with the example above. Tasks have `{ id, title }`; provision
tasks and users through your application's repositories before adding comments.
This feature does not add task/user creation endpoints or an application server.
Enable foreign keys on every additional SQLite connection. Deleting a task
cascades to its comments; deleting a referenced author is restricted.

| Method | Path | JSON Body | Success |
| --- | --- | --- | --- |
| POST | `/tasks/:taskId/comments` | `{ "userId": 1, "content": "Ready for review" }` | 201, comment |
| GET | `/tasks/:taskId/comments` | None | 200, comment array in ID order |
| GET | `/tasks/:taskId/comments/:id` | None | 200, comment |
| PUT | `/tasks/:taskId/comments/:id` | `{ "content": "Reviewed" }` | 200, updated comment |
| DELETE | `/tasks/:taskId/comments/:id` | None | 204, no body |

Each comment is `{ id, taskId, userId, content }`. IDs must be positive safe
integers. Content is trimmed and must contain 1 to 5000 characters. Unknown body
fields are ignored; updates cannot change the author or task. Content is stored
as plain text with bound parameters; clients must render it as text, not HTML.
An existing task with no comments returns `[]`.

Missing tasks, authors, or comments return 404 with `TASK_NOT_FOUND`,
`USER_NOT_FOUND`, or `COMMENT_NOT_FOUND`. Member operations never match comments
belonging to another task. Validation returns 400 `VALIDATION_ERROR` with
field-level `details`. JSON parsing, payload-size, encoding, and throttling errors
use the same codes as the posts router. Storage failures return 500
`COMMENTS_FAILED`, logging diagnostics only on the server.

The router includes Helmet, a 100 KB JSON limit, and a shared per-router limit
of 60 requests per minute per client IP across all its endpoints. Mount it under
an appropriate application prefix and configure proxy/shared-store settings as
described above. Authentication and task/author authorization are the host
application's responsibility: validate the caller's access to the task and
permission to create, edit, or delete comments before this router. The supplied
`userId` is a checked database reference, not proof of the caller's identity.

Feature tests use Jest, Supertest, and real in-memory SQLite:

```sh
npm test -- --runInBand --runTestsByPath api/src/tests/comments.test.ts
```

The methods have asynchronous interfaces for callers, but the SQLite drivers
driver performs synchronous I/O; this minimal implementation is not intended
for high-throughput workloads on the main event loop.
# gh-300-week7a
