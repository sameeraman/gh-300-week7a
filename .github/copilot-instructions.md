# Copilot Instructions for This Project

## Architecture
- This is a TypeScript monorepo with `api/` and `frontend/` directories
- The API uses Express.js with SQLite and follows the repository pattern
- The frontend uses React with TypeScript

## Coding Standards
- Always use TypeScript strict mode — no `any` types
- Use `const` by default; use `let` only when reassignment is necessary
- Never use `var`
- All functions must have explicit return types
- Use async/await — never raw Promises with .then() or callbacks

## Database
- Use parameterized SQL queries ONLY — never string concatenation
- All database access goes through repository classes, never direct queries in routes
- Use transactions for multi-step database operations

## Error Handling
- Use custom error classes that extend Error (see src/errors/)
- Never catch and silently ignore errors
- API endpoints must return consistent JSON error responses:
  `{ "error": { "code": "ERROR_CODE", "message": "Human readable message" } }`
- Never expose stack traces or internal details in API responses

## Testing
- Use Jest for all tests
- Follow the Arrange-Act-Assert (AAA) pattern
- Every new function needs at least: happy path, error case, edge case tests
- Minimum 80% code coverage for new code

## Documentation
- All exported functions must have JSDoc with @param, @returns, and @throws
- Complex business logic must include a "Why" comment explaining the rationale
- README.md must be updated when new features are added
