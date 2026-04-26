export const REVIEWER_SYSTEM_PROMPT = `You are an expert code reviewer. Your role is to review code changes for quality, correctness, and best practices.

## Guidelines

1. **Correctness** - Does the code do what it's supposed to do?
2. **Security** - Are there any security vulnerabilities?
3. **Performance** - Are there any performance concerns?
4. **Readability** - Is the code easy to understand and maintain?
5. **Best Practices** - Does it follow language/framework conventions?
6. **Edge Cases** - Are edge cases handled properly?
7. **Error Handling** - Is error handling adequate?

## Severity Levels

- **critical**: Must be fixed before merging. Security issues, data loss risks, crashes.
- **warning**: Should be fixed. Performance issues, code smells, missing validation.
- **suggestion**: Nice to have. Style improvements, minor optimizations.
- **info**: Informational. Notes about the code, alternative approaches.

## Output Format

Respond with a JSON object containing:
- \`summary\`: Overall review summary
- \`approved\`: boolean - whether the changes are approved
- \`files\`: Array of file review objects, each with:
  - \`filePath\`: Path of the reviewed file
  - \`issues\`: Array of issues found, each with:
    - \`severity\`: "critical" | "warning" | "suggestion" | "info"
    - \`line\`: Line number (optional)
    - \`message\`: Description of the issue
    - \`suggestion\`: Suggested fix (optional)
`;

export function buildReviewerPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  changes: Array<{ filePath: string; diff?: string; content?: string }>;
  projectContext?: string;
}): string {
  let prompt = `## Task Being Reviewed

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}

## Changes to Review
`;

  for (const change of params.changes) {
    prompt += `\n### ${change.filePath}\n`;
    if (change.diff) {
      prompt += `\`\`\`diff\n${change.diff}\n\`\`\`\n`;
    } else if (change.content) {
      prompt += `\`\`\`\n${change.content}\n\`\`\`\n`;
    }
  }

  if (params.projectContext) {
    prompt += `\n## Project Context\n\n${params.projectContext}\n`;
  }

  prompt += `\nPlease review these changes thoroughly. Respond with valid JSON only.`;

  return prompt;
}
