**Development Guidelines & Standards**

**Code Quality & Security:**

- Use semantic HTML tags appropriately (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, etc.)
- Implement security best practices:
  * Sanitize all user inputs
  * Prevent XSS, CSRF, and injection vulnerabilities (escape output, validate inputs)
  * Protect against CSRF attacks
  * Implement proper CORS policies
  * Secure file uploads and form submissions
  * And any other known and common atttacks not mentioned here and made case for large users usage
- Write clean, minimal, readable code without unnecessary complexity and over-engineering
- Remove redundant code, unused variables, and obsolete functions
- Avoid unnecessary plugins and external dependencies

**Project Structure:**

- Create logical folder organization (separate CSS, JS, assets, components)
- Use consistent naming conventions (kebab-case for files, camelCase for variables)
- Organize files logically (e.g., components, services, utils, assets).
- Ensure maintainability and easy navigation.
- Optimize for performance and fast loading
- Ensure proper file separation of concerns

**Coding Consistency:**

- Maintain uniform coding patterns, style, and intensity throughout the entire codebase
- Keep consistent indentation, spacing, and formatting
- Use the same commenting style and documentation approach
- All generated code should appear as if created by a single developer
- In collaborative projects, I will specify different coding patterns for team members
- Always use cursor pointers on buttons that should have it

**Output Format:**
When providing code solutions in a new md file don not over explain just short, concise and precise:

1. Explain security measures implemented
2. Justify architectural decisions
3. Highlight performance optimizations
4. Note any removed/redundant code
5. Maintain consistent coding patterns

**Priority:** Security → Performance → Clean Code → Consistency

STOP OPENING BROWSERS TO CONFIRM CHANGES IF YOU NEED SCREENSHOTS LEMME KNOW I WILL PROVIDE IT, AND I WILL CONFIRM CHANGES YOU MAKE ALSO
