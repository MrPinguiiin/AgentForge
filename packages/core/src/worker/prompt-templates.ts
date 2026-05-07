/**
 * Prompt Templates for TaskHive Workers
 *
 * Per docs sections 11 (Planning) and 12 (Execution).
 *
 * IMPORTANT: Every prompt MUST include the explicit workspace path so that
 * OpenCode agents only operate inside the target project directory and never
 * read/write files in the TaskHive monorepo itself.
 */

import type { Task, Project, PlanningResult } from "../db/schema.js";

// ── Shared workspace constraint block ──────────────────────

function workspaceBlock(projectPath: string): string {
  return `
WORKSPACE RULES (CRITICAL — read carefully):
- Your ONLY workspace is: ${projectPath}
- All file reads, writes, edits, and bash commands MUST target ${projectPath} or its subdirectories.
- Do NOT read, inspect, or reference any directory outside ${projectPath}.
- Do NOT access /mnt/data, /home/*/.config, or any other project.
- If you need to create files, create them directly inside ${projectPath}.
- If the directory is empty, that is expected — you are starting from scratch.`;
}

/**
 * Build the planning prompt per docs section 11.
 */
export function buildPlanningPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, project: {
  name: string;
  rootPath: string;
}, labels: string[] = []): string {
  return `You are TaskHive Planning Agent.

You are running inside OpenCode behind a Kanban orchestration system.
Your job is to create a safe implementation plan only.
Do not edit files. Do not run destructive commands. Do not commit. Do not push.
${workspaceBlock(project.rootPath)}

Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

Repository: ${project.name}
Project Path: ${project.rootPath}

Task Labels: ${labels.length > 0 ? labels.join(", ") : "None"}

Return only valid JSON using this schema:

{
  "summary": "short task summary",
  "needs_human": false,
  "human_questions": [],
  "risk_level": "low | medium | high",
  "recommended_agent": "frontend | backend | build | qa | docs",
  "recommended_subagents": [],
  "files_to_inspect": [],
  "likely_files_to_change": [],
  "implementation_steps": [],
  "test_plan": [],
  "acceptance_checklist": [],
  "routing_decision": {
    "next_column": "Ready For Agent",
    "reason": "planning completed"
  }
}

IMPORTANT: Return ONLY the JSON object. No markdown, no explanation, no code fences. Just the raw JSON.`;
}

/**
 * Build the execution prompt per docs section 12.
 */
export function buildExecutionPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, plan: PlanningResult, branchName: string, recommendedAgent: string, projectPath: string): string {
  return `You are TaskHive Execution Agent.

You are running inside OpenCode behind a Kanban orchestration system.
Your job is to implement the approved plan by creating and editing files.
${workspaceBlock(projectPath)}

Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

Implementation Steps:
${plan.implementation_steps?.map((s, i) => `${i + 1}. ${s}`).join("\n") || "Follow the plan."}

Files to create or modify (inside ${projectPath}):
${plan.likely_files_to_change?.map((f) => `- ${projectPath}/${f}`).join("\n") || "- Determine from the task description."}

Rules:
- Create all files inside ${projectPath}.
- Keep changes minimal and focused on the task.
- Do not commit or push.
- If blocked, stop and explain the blocker.

Expected Output:
After creating the files, return a brief summary listing:
- files created or changed
- what was implemented
- whether acceptance criteria are satisfied`;
}

/**
 * Build the review prompt for the review agent.
 */
export function buildReviewPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, gitDiff: string, plan?: PlanningResult | null, projectPath?: string): string {
  return `You are TaskHive Code Review Agent.

You are reviewing code changes made by an AI coding agent.
${projectPath ? workspaceBlock(projectPath) : ""}

Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

${plan ? `Original Plan:\n${JSON.stringify(plan, null, 2)}\n` : ""}

Git Diff:
\`\`\`diff
${gitDiff || "(no git diff available — project may not be a git repository)"}
\`\`\`

Review the changes for:
1. Correctness — Does the code do what the task asks?
2. Security — Any security issues?
3. Maintainability — Is the code clean and well-structured?
4. Acceptance criteria — Are all criteria met?

Return your review as JSON:

{
  "verdict": "approve | request_changes",
  "issues": [],
  "suggestions": [],
  "risk_level": "low | medium | high",
  "acceptance_criteria_met": true,
  "summary": "brief review summary"
}

IMPORTANT: Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
}

/**
 * Build the QA prompt for the QA agent.
 */
export function buildQAPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, plan?: PlanningResult | null, projectPath?: string): string {
  return `You are TaskHive QA Verification Agent.

You are verifying that files were created correctly by an AI coding agent.
${projectPath ? workspaceBlock(projectPath) : ""}

Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

${plan ? `Expected files:\n${plan.likely_files_to_change?.map((f) => `- ${f}`).join("\n") || "See acceptance criteria."}\n` : ""}

Your responsibilities:
1. List the files in ${projectPath || "the project directory"} to verify they exist.
2. Read each expected file and verify it has reasonable content.
3. Check acceptance criteria are satisfied.

Return your QA report as JSON:

{
  "tests_run": [],
  "tests_passed": true,
  "failing_tests": [],
  "acceptance_checklist": [],
  "verification_summary": "brief summary",
  "recommendation": "pass | fail | needs_attention"
}

IMPORTANT: Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
}
