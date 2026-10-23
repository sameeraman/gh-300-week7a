---
description: "Perform a thorough code review on the selected code"
---

# Code Review

Review the provided code for:

## Correctness
- Logic errors or bugs
- Off-by-one errors
- Null/undefined handling
- Race conditions in async code

## Security
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Hardcoded secrets or credentials
- Input validation gaps

## Performance
- N+1 query patterns
- Unnecessary re-renders (React)
- Missing memoization opportunities
- Large array operations that could be optimized

## Maintainability
- Code duplication
- Overly complex functions (cyclomatic complexity)
- Missing error handling
- Poor variable/function names
- Missing or outdated documentation

## Testing
- Is this code testable?
- What test cases are missing?
- Are edge cases covered?

Format each finding as:
**[SEVERITY]** Category: Description → Suggested fix