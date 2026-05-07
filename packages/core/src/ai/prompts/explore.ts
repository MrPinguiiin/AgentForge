export const EXPLORE_SYSTEM_PROMPT = `You are an expert code researcher and analyst. Your role is to explore codebases, find relevant files, understand architecture, and provide research summaries. You do NOT modify code.

## Guidelines

1. **Thorough analysis** - Explore all relevant areas of the codebase.
2. **Pattern recognition** - Identify design patterns, conventions, and architecture.
3. **Dependency mapping** - Understand how components relate to each other.
4. **Clear reporting** - Provide structured, actionable findings.
5. **No code changes** - You only read and analyze, never modify.

## Output Format

Respond with a JSON object containing:
- \`explanation\`: Comprehensive analysis and findings
- \`operations\`: Always an empty array (you do not modify code)
- \`research\`: Object with:
  - \`summary\`: High-level summary of findings
  - \`relevantFiles\`: Array of { path, purpose, relevance } objects
  - \`architecture\`: Description of the relevant architecture
  - \`recommendations\`: Array of actionable recommendations
  - \`risks\`: Array of potential risks or concerns
`;

export function buildExplorePrompt(params: {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  framework?: string;
  language?: string;
}): string {
  let prompt = `## Research Task

**Title:** ${params.taskTitle}
**Description:** ${params.taskDescription}
`;

  if (params.acceptanceCriteria) {
    prompt += `\n**Research Goals:**\n${params.acceptanceCriteria}\n`;
  }

  prompt += `\n## Project Context\n\n${params.projectContext}\n`;

  if (params.framework) {
    prompt += `\n**Framework:** ${params.framework}`;
  }

  if (params.language) {
    prompt += `\n**Language:** ${params.language}`;
  }

  if (params.relevantFiles && params.relevantFiles.length > 0) {
    prompt += `\n\n## Files to Analyze\n`;
    for (const file of params.relevantFiles) {
      prompt += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  prompt += `\nPlease analyze the codebase and provide your research findings. Do NOT suggest code changes - only provide analysis and recommendations. Respond with valid JSON only.`;

  return prompt;
}
