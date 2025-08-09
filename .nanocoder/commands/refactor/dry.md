---
description: Apply DRY principle to reduce code duplication
aliases: [dedupe]
parameters: [target]
---

Analyze {{target}} for code duplication and apply the DRY (Don't Repeat Yourself) principle.

If {{target}} is provided, focus on that specific file or directory.
Otherwise, scan the entire project for duplication.

Steps:
1. Identify repeated code patterns
2. Extract common functionality into reusable functions/components
3. Update all instances to use the new abstraction
4. Ensure no functionality is broken
5. Run tests if available