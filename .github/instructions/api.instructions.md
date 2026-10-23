---
applyTo: "api/**"
---

# API-Specific Instructions

## Framework
- Use Express.js with TypeScript
- All routes must use async request handlers with try/catch
- Use express-validator for input validation on all endpoints

## Database
- Use better-sqlite3 for database access
- All queries must be parameterized (use ? placeholders)
- Use repository pattern — no direct database access in route handlers

## HTTP Conventions
- POST returns 201 with created resource
- PUT returns 200 with updated resource
- DELETE returns 204 with no body
- GET returns 200 with resource or array
- Not found returns 404 with error object
- Validation errors return 400 with field-level error details

## Security
- Validate and sanitize all request body inputs
- Rate limit all endpoints
- Use helmet middleware for security headers
- Never expose internal error details in responses