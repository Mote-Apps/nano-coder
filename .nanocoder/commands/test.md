---
description: Generate comprehensive unit tests
aliases: [unittest, test-gen]
parameters: [filename]
---

Generate comprehensive unit tests for the file {{filename}}.

Consider the following:
1. Test all public functions and methods
2. Include edge cases and error scenarios
3. Use appropriate mocking where needed
4. Follow the existing test framework conventions in this project
5. Ensure good test coverage

If {{filename}} is not provided, analyze the most recently modified files and suggest which ones need tests.