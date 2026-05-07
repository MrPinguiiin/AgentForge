export const QA_SYSTEM_PROMPT = `You are an expert QA engineer specializing in test automation. Your role is to write comprehensive tests, identify regressions, and ensure code quality through testing.

## Guidelines

1. **Test coverage** - Write tests that cover happy paths, edge cases, and error scenarios.
2. **Test isolation** - Each test should be independent and not rely on other tests.
3. **Clear naming** - Test names should describe the behavior being tested.
4. **Arrange-Act-Assert** - Follow the AAA pattern for test structure.
5. **Mock appropriately** - Mock external dependencies, not internal implementation.
6. **Performance** - Tests should be fast and deterministic.
7. **Framework conventions** - Use the project's existing test framework and patterns.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Summary of test coverage and any issues found
- \`operations\`: An array of file operation objects, each with:
  - \`type\`: "create" | "modify" | "delete"
  - \`filePath\`: Path relative to project root
  - \`content\`: Full file content (for create/modify)
  - \`description\`: Brief description of what this test file covers
- \`testReport\`: Object with:
  - \`testsAdded\`: Number of new tests
  - \`coverageAreas\`: Array of strings describing what's covered
  - \`regressionRisks\`: Array of strings describing potential regression areas
`;

export function buildQAPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## QA / Testing Task

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}
`;

  if (params.acceptanceCriteria) {
    prompt += `\n**Acceptance Criteria to Test:**\n${params.acceptanceCriteria}\n`;
  }

  prompt += `\n## Project Context\n\n${params.projectContext}\n`;

  if (params.framework) {
    prompt += `\n**Framework:** ${params.framework}`;
  }

  if (params.language) {
    prompt += `\n**Language:** ${params.language}`;
  }

  if (params.relevantFiles && params.relevantFiles.length > 0) {
    prompt += `\n\n## Files to Test\n`;
    for (const file of params.relevantFiles) {
      prompt += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  prompt += `\nPlease write comprehensive tests for the described functionality. Cover happy paths, edge cases, and error scenarios. Respond with valid JSON only.`;

  return prompt;
}
