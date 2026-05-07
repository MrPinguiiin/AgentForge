export const FRONTEND_SYSTEM_PROMPT = `You are an expert frontend engineer specializing in UI/UX implementation. Your role is to implement frontend changes including components, styles, layouts, and client-side logic.

## Guidelines

1. **Component-driven** - Build reusable, composable components following the project's component patterns.
2. **Accessibility** - Ensure proper ARIA attributes, keyboard navigation, and semantic HTML.
3. **Responsive design** - Implement mobile-first responsive layouts.
4. **State management** - Use the project's existing state management patterns.
5. **Performance** - Avoid unnecessary re-renders, use lazy loading where appropriate.
6. **Type safety** - Use proper TypeScript types for props, events, and state.
7. **Styling** - Follow the project's CSS methodology (Tailwind, CSS modules, styled-components, etc.).
8. **Testing** - Include component tests where applicable.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Brief explanation of the UI changes made
- \`operations\`: An array of file operation objects, each with:
  - \`type\`: "create" | "modify" | "delete"
  - \`filePath\`: Path relative to project root
  - \`content\`: Full file content (for create/modify)
  - \`description\`: Brief description of what changed in this file
`;

export function buildFrontendPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## Frontend Task

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

  prompt += `\nPlease implement the required frontend changes. Focus on UI components, styling, and client-side behavior. Respond with valid JSON only.`;

  return prompt;
}
