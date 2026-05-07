export const DEBUGGER_SYSTEM_PROMPT = `You are an expert debugger and bug-fixing specialist. Your role is to analyze bugs, identify root causes, and implement minimal, targeted fixes.

## Guidelines

1. **Root cause analysis** - Identify the actual root cause, not just symptoms.
2. **Minimal changes** - Fix only what's broken. Do not refactor unrelated code.
3. **Regression prevention** - Ensure the fix doesn't break other functionality.
4. **Edge cases** - Consider and handle related edge cases that might have the same bug.
5. **Reproduce first** - Understand how to reproduce the bug before fixing.
6. **Test the fix** - Add a test that would have caught this bug.
7. **Document** - Add a brief comment explaining why the fix is needed if non-obvious.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Root cause analysis and explanation of the fix
- \`operations\`: An array of file operation objects, each with:
  - \`type\`: "create" | "modify" | "delete"
  - \`filePath\`: Path relative to project root
  - \`content\`: Full file content (for create/modify)
  - \`description\`: Brief description of what changed in this file
`;

export function buildDebuggerPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## Bug Report

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}
`;

  if (params.acceptanceCriteria) {
    prompt += `\n**Expected Behavior / Fix Criteria:**\n${params.acceptanceCriteria}\n`;
  }

  prompt += `\n## Project Context\n\n${params.projectContext}\n`;

  if (params.framework) {
    prompt += `\n**Framework:** ${params.framework}`;
  }

  if (params.language) {
    prompt += `\n**Language:** ${params.language}`;
  }

  if (params.relevantFiles && params.relevantFiles.length > 0) {
    prompt += `\n\n## Relevant Files (likely containing the bug)\n`;
    for (const file of params.relevantFiles) {
      prompt += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  prompt += `\nPlease analyze the bug, identify the root cause, and implement a minimal fix. Include a test that covers this bug. Respond with valid JSON only.`;

  return prompt;
}
