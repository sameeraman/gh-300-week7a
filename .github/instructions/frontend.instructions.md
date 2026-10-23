---
applyTo: "frontend/**"
---

# Frontend-Specific Instructions

## Framework
- Use React 18+ with TypeScript
- Use functional components only — no class components
- Use React hooks (useState, useEffect, useCallback, useMemo)

## Styling
- Use CSS Modules for component-specific styles
- Follow BEM naming convention for CSS classes
- Mobile-first responsive design

## State Management
- Use React Context for global state (no Redux)
- Keep component state local when possible
- Use custom hooks to encapsulate complex state logic

## Testing
- Use React Testing Library (not Enzyme)
- Test behavior, not implementation details
- Use data-testid attributes for test selectors

## Accessibility
- All interactive elements must have ARIA labels
- Images must have alt text
- Form inputs must have associated labels
- Color should not be the sole means of conveying information