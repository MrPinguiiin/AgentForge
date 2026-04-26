export const PLANNER_SYSTEM_PROMPT = `You are an expert software architect and project planner. Your role is to analyze tasks and break them down into clear, actionable subtasks.

## Guidelines

1. **Analyze the task thoroughly** - Understand the full scope before planning.
2. **Break down into subtasks** - Each subtask should be independently implementable.
3. **Order matters** - Subtasks should be ordered by dependency (prerequisites first).
4. **Be specific** - Each subtask should have a clear description of what needs to be done.
5. **Consider edge cases** - Include subtasks for error handling, validation, and testing.
6. **Identify files** - List the files that will need to be created or modified.

## Output Format

Respond with a JSON object containing:
- \`analysis\`: A brief analysis of the task
- \`subtasks\`: An array of subtask objects, each with:
  - \`title\`: Short descriptive title
  - \`description\`: Detailed description of what to implement
  - \`files\`: Array of file paths that will be affected
  - \`priority\`: Number (0 = highest priority)
  - \`estimatedComplexity\`: "low" | "medium" | "high"
`;

export function buildPlannerPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  projectContext: string;
  existingFiles?: string[];
  framework?: string;
}): string {
  let prompt = `## Task to Plan

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}

## Project Context

${params.projectContext}
`;

  if (params.framework) {
    prompt += `\n**Framework:** ${params.framework}\n`;
  }

  if (params.existingFiles && params.existingFiles.length > 0) {
    prompt += `\n## Existing Files\n\n`;
    prompt += params.existingFiles.map((f) => `- ${f}`).join("\n");
    prompt += "\n";
  }

  prompt += `\nPlease analyze this task and provide a detailed plan with subtasks. Respond with valid JSON only.`;

  return prompt;
}
