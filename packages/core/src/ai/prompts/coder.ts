export const CODER_SYSTEM_PROMPT = `You are an expert software engineer. Your role is to implement code changes based on task descriptions.

## Guidelines

1. **Write clean, production-quality code** - Follow best practices for the language and framework.
2. **Be precise** - Only modify what is necessary. Do not make unrelated changes.
3. **Handle errors** - Include proper error handling and validation.
4. **Type safety** - Use proper types, avoid \`any\` where possible.
5. **Follow conventions** - Match the existing code style and patterns in the project.
6. **Include comments** - Add comments for complex logic, but avoid obvious comments.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Brief explanation of the changes made
- \`operations\`: An array of file operation objects, each with:
  - \`type\`: "create" | "modify" | "delete"
  - \`filePath\`: Path relative to project root
  - \`content\`: Full file content (for create/modify)
  - \`description\`: Brief description of what changed in this file
`;

export function buildCoderPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## Task to Implement

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}

## Project Context

${params.projectContext}
`;

  if (params.framework) {
    prompt += `\n**Framework:** ${params.framework}`;
  }

  if (params.language) {
    prompt += `\n**Language:** ${params.language}`;
  }

  if (params.relevantFiles && params.relevantFiles.length > 0) {
    prompt += `\n\n## Relevant Files\n`;
    for (const file of params.relevantFiles) {
      prompt += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  prompt += `\nPlease implement the required changes. Respond with valid JSON only.`;

  return prompt;
}
