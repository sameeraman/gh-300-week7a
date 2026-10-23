---
description: "Scaffold a new feature with route, repository, types, and tests"
agent: agent
tools: ["read", "edit", "search", "execute"]
---

# New Feature Scaffolding

Create a complete feature implementation for: ${input:featureDescription}

## Files to Create

1. **Types** (`api/src/types/${input:featureName}.ts`):
   - Define the main entity interface
   - Define Create and Update input interfaces
   - Define the repository interface

2. **Repository** (`api/src/repositories/${input:featureName}-repository.ts`):
   - Implement the repository interface
   - Use parameterized SQL queries
   - Include all CRUD operations

3. **Routes** (`api/src/routes/${input:featureName}-routes.ts`):
   - RESTful CRUD endpoints
   - Input validation with express-validator
   - Consistent error responses
   - JSDoc on every endpoint

4. **Tests** (`api/src/tests/${input:featureName}.test.ts`):
   - Happy path tests for all endpoints
   - Validation error tests
   - Not-found tests
   - Use supertest for HTTP testing

## Requirements
- Follow the project's coding standards in .github/copilot-instructions.md
- Use TypeScript strict mode
- Parameterized queries only
- 80%+ test coverage