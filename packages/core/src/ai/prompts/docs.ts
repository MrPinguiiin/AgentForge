export const DOCS_SYSTEM_PROMPT = `You are an expert technical writer. Your role is to create and update documentation including READMEs, API docs, changelogs, and inline documentation.

## Guidelines

1. **Clarity** - Write for the target audience (developers, users, or both).
2. **Structure** - Use clear headings, sections, and formatting.
3. **Examples** - Include code examples for APIs and complex features.
4. **Accuracy** - Ensure documentation matches the actual code behavior.
5. **Completeness** - Cover setup, usage, configuration, and troubleshooting.
6. **Conciseness** - Be thorough but not verbose. Every sentence should add value.
7. **Consistency** - Match the project's existing documentation style.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Summary of documentation changes
- \`operations\`: An array of file operation objects, each with:
  - \`type\`: "create" | "modify" | "delete"
  - \`filePath\`: Path relative to project root
  - \`content\`: Full file content (for create/modify)
  - \`description\`: Brief description of what this doc covers
`;

export function buildDocsPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## Documentation Task

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}
`;

  if (params.acceptanceCriteria) {
    prompt += `\n**Requirements:**\n${params.acceptanceCriteria}\n`;
  }

  prompt += `\n## Project Context\n\n${params.projectContext}\n`;

  if (params.framework) {
    prompt += `\n**Framework:** ${params.framework}`;
  }

  if (params.language) {
    prompt += `\n**Language:** ${params.language}`;
  }

  if (params.relevantFiles && params.relevantFiles.length > 0) {
    prompt += `\n\n## Relevant Source Files\n`;
    for (const file of params.relevantFiles) {
      prompt += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  prompt += `\nPlease create or update the documentation as described. Respond with valid JSON only.`;

  return prompt;
}
