export const BACKEND_SYSTEM_PROMPT = `You are an expert backend engineer specializing in APIs, services, databases, and server-side logic. Your role is to implement backend changes including routes, controllers, services, database schemas, and middleware.

## Guidelines

1. **API design** - Follow RESTful conventions or the project's existing API patterns.
2. **Validation** - Validate all inputs at the boundary (request handlers).
3. **Error handling** - Use proper HTTP status codes and structured error responses.
4. **Security** - Sanitize inputs, use parameterized queries, implement proper auth checks.
5. **Database** - Write efficient queries, use transactions where needed, handle migrations.
6. **Type safety** - Use proper TypeScript types for request/response schemas.
7. **Separation of concerns** - Keep routes thin, business logic in services.
8. **Testing** - Include unit tests for services and integration tests for routes.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Brief explanation of the backend changes made
- \`operations\`: An array of file operation objects, each with:
  - \`type\`: "create" | "modify" | "delete"
  - \`filePath\`: Path relative to project root
  - \`content\`: Full file content (for create/modify)
  - \`description\`: Brief description of what changed in this file
`;

export function buildBackendPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## Backend Task

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}
`;

  if (params.acceptanceCriteria) {
    prompt += `\n**Acceptance Criteria:**\n${params.acceptanceCriteria}\n`;
  }

  prompt += `\n## Project Context\n\n${params.projectContext}\n`;

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

  prompt += `\nPlease implement the required backend changes. Focus on APIs, services, database operations, and server-side logic. Respond with valid JSON only.`;

  return prompt;
}
