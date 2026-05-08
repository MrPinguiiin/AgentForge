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
 * Detect the language of the task title/description and return an instruction
 * telling the AI to respond in that same language.
 */
function languageBlock(title: string, description?: string | null): string {
  const text = `${title} ${description ?? ""}`.trim();
  // Simple heuristic: check for common non-ASCII scripts
  const hasLatin = /[a-zA-Z]{3,}/.test(text);
  const hasCJK = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text);
  const hasKorean = /[\uAC00-\uD7AF]/.test(text);
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasCyrillic = /[\u0400-\u04FF]/.test(text);
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
  // Indonesian/Malay detection: Latin script with common Indonesian words
  const indonesianWords = /\b(dan|atau|untuk|dengan|dari|yang|ini|itu|pada|ke|di|buat|tambah|fungsi|halaman|fitur|tampilan|ubah|hapus|perbaiki)\b/i;
  const isIndonesian = hasLatin && indonesianWords.test(text);

  if (isIndonesian) return "\nLANGUAGE: The task is written in Indonesian (Bahasa Indonesia). You MUST write ALL your responses, summaries, and explanations in Indonesian. Code comments may remain in English.";
  if (hasCJK && !hasJapanese && !hasKorean) return "\nLANGUAGE: The task is written in Chinese. You MUST write ALL your responses, summaries, and explanations in Chinese.";
  if (hasJapanese) return "\nLANGUAGE: The task is written in Japanese. You MUST write ALL your responses, summaries, and explanations in Japanese.";
  if (hasKorean) return "\nLANGUAGE: The task is written in Korean. You MUST write ALL your responses, summaries, and explanations in Korean.";
  if (hasArabic) return "\nLANGUAGE: The task is written in Arabic. You MUST write ALL your responses, summaries, and explanations in Arabic.";
  if (hasCyrillic) return "\nLANGUAGE: The task is written in Russian. You MUST write ALL your responses, summaries, and explanations in Russian.";
  return "\nLANGUAGE: Write all responses, summaries, and explanations in English.";
}

/**
 * Build the planning prompt per docs section 11.
 * Now includes project context and sibling task awareness.
 */
export function buildPlanningPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, project: {
  name: string;
  rootPath: string;
}, labels: string[] = [], projectContext?: string, siblingTasksContext?: string): string {
  return `You are TaskHive Planning Agent.

You are running inside OpenCode behind a Kanban orchestration system.
Your job is to create a safe implementation plan only.
Do not edit files. Do not run destructive commands. Do not commit. Do not push.
${workspaceBlock(project.rootPath)}
${languageBlock(task.title, task.description)}

${projectContext ? `${projectContext}\n` : ""}${siblingTasksContext ? `${siblingTasksContext}\n` : ""}
Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

Repository: ${project.name}
Project Path: ${project.rootPath}

Task Labels: ${labels.length > 0 ? labels.join(", ") : "None"}

PLANNING INSTRUCTIONS:
- Study the PROJECT CONTEXT above carefully before planning.
- If existing files reference other files (e.g., <script src="script.js">), your plan MUST account for those references.
- If RELATED TASKS have already created files, your plan should integrate with them, not duplicate them.
- Your "likely_files_to_change" should only include files this task needs to create or modify.
- Your "implementation_steps" should reference existing files when relevant.

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
 * Now includes project context and sibling task awareness.
 */
export function buildExecutionPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, plan: PlanningResult, branchName: string, recommendedAgent: string, projectPath: string, projectContext?: string, siblingTasksContext?: string): string {
  return `You are TaskHive Execution Agent.

You are running inside OpenCode behind a Kanban orchestration system.
Your job is to implement the approved plan by creating and editing files.
${workspaceBlock(projectPath)}
${languageBlock(task.title, task.description)}

${projectContext ? `${projectContext}\n` : ""}${siblingTasksContext ? `${siblingTasksContext}\n` : ""}
Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

Implementation Steps:
${plan.implementation_steps?.map((s, i) => `${i + 1}. ${s}`).join("\n") || "Follow the plan."}

Files to create or modify (inside ${projectPath}):
${plan.likely_files_to_change?.map((f) => `- ${projectPath}/${f}`).join("\n") || "- Determine from the task description."}

EXECUTION RULES (FOLLOW THIS ORDER):

STEP 1 — EXPLORE FIRST (MANDATORY):
- BEFORE writing ANY code, use the Read tool to read ALL existing files in ${projectPath}.
- Use Glob to discover all files: "**/*" in ${projectPath}.
- Read each file to understand the current codebase structure.
- Pay special attention to HTML files that reference scripts/styles (e.g., <script src="...">).
- If RELATED TASKS above show code changes, understand how those files work.

STEP 2 — PLAN INTEGRATION:
- Identify which existing files your code needs to connect with.
- If an HTML file already has <script src="script.js">, your script.js must export/expose what that HTML expects.
- If a module already exports functions, import from it instead of recreating.
- Match variable names, function signatures, and patterns from existing code.

STEP 3 — IMPLEMENT:
- Create all files inside ${projectPath}.
- Keep changes minimal and focused on the task.
- Do not commit or push.
- If blocked, stop and explain the blocker.
- If a file already exists, modify it instead of overwriting (unless the task requires replacement).

STEP 4 — VERIFY CONNECTIONS:
- After creating files, verify that all cross-file references work:
  - HTML <script src="..."> points to files that exist
  - import/require statements reference correct paths
  - CSS class names match between HTML and stylesheets
  - Function calls match exported function signatures

Expected Output:
After creating the files, return a brief summary listing:
- files created or changed
- what was implemented
- how your code integrates with existing files
- whether acceptance criteria are satisfied`;
}

/**
 * Build the review prompt for the review agent.
 * Now includes project context and sibling task awareness.
 */
export function buildReviewPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, gitDiff: string, plan?: PlanningResult | null, projectPath?: string, projectContext?: string, siblingTasksContext?: string): string {
  return `You are TaskHive Code Review Agent.

You are reviewing code changes made by an AI coding agent.
Your job is to STRICTLY verify that the changes match the task requirements and acceptance criteria.
${projectPath ? workspaceBlock(projectPath) : ""}
${languageBlock(task.title, task.description)}

${projectContext ? `${projectContext}\n` : ""}${siblingTasksContext ? `${siblingTasksContext}\n` : ""}
Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

${plan ? `Original Plan Summary: ${plan.summary || "(no summary)"}\nExpected Files: ${plan.likely_files_to_change?.join(", ") || "(none specified)"}\n` : ""}

Git Diff:
\`\`\`diff
${gitDiff || "(no git diff available — project may not be a git repository)"}
\`\`\`

REVIEW CHECKLIST — check each item carefully:
1. Correctness — Does the code do what the task asks? Does it match the description?
2. Acceptance Criteria — Go through EACH acceptance criterion one by one. Is it met?
3. File Scope — Are only the necessary files created? No unnecessary files (like package.json, test folders, config files) unless the task specifically asks for them?
4. Integration — If other tasks created files, do the new changes integrate properly?
5. Security — Any security issues?
6. Maintainability — Is the code clean and well-structured?

IMPORTANT: If ANY acceptance criterion is NOT met, your verdict MUST be "request_changes".
Be strict. Do not approve code that doesn't fully satisfy the acceptance criteria.

Return your review as JSON:

{
  "verdict": "approve | request_changes",
  "acceptance_criteria_results": [
    { "criterion": "the criterion text", "met": true, "detail": "how it was verified" }
  ],
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
 * Now includes project context, sibling tasks, test plan, and acceptance checklist from planning.
 */
export function buildQAPrompt(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
}, plan?: PlanningResult | null, projectPath?: string, projectContext?: string, siblingTasksContext?: string): string {
  // Build test plan section from planning result
  const testPlanSection = plan?.test_plan?.length
    ? `TEST PLAN (from planning phase — verify each item):\n${plan.test_plan.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  // Build acceptance checklist section from planning result
  const checklistSection = plan?.acceptance_checklist?.length
    ? `ACCEPTANCE CHECKLIST (from planning phase — verify each item):\n${plan.acceptance_checklist.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
    : "";

  // Build expected files section
  const expectedFilesSection = plan?.likely_files_to_change?.length
    ? `EXPECTED FILES (from plan):\n${plan.likely_files_to_change.map((f) => `- ${f}`).join("\n")}`
    : "";

  return `You are TaskHive QA Verification Agent.

You are verifying that an AI coding agent completed its task correctly.
Your job is to be STRICT — only pass tasks that fully satisfy ALL acceptance criteria.
${projectPath ? workspaceBlock(projectPath) : ""}
${languageBlock(task.title, task.description)}

${projectContext ? `${projectContext}\n` : ""}${siblingTasksContext ? `${siblingTasksContext}\n` : ""}
Task: ${task.title}

Description:
${task.description || "No description provided."}

Acceptance Criteria:
${task.acceptanceCriteria || "No specific acceptance criteria."}

${expectedFilesSection}

${testPlanSection}

${checklistSection}

YOUR QA PROCESS — follow these steps in order:
1. List all files in ${projectPath || "the project directory"} to see what exists.
2. Read each expected file and verify it has correct, working content.
3. Go through EACH acceptance criterion one by one — verify it is satisfied.
4. Go through EACH test plan item — verify it passes.
5. Go through EACH acceptance checklist item — verify it is met.
6. Check that NO unnecessary files were created (e.g., package.json, node_modules, test folders) unless the task specifically asked for them.

STRICT RULES:
- If ANY acceptance criterion is NOT met → recommendation MUST be "fail"
- If expected files are missing → recommendation MUST be "fail"
- If files exist but have wrong content → recommendation MUST be "fail"
- Only recommend "pass" if ALL criteria are fully satisfied
- Provide specific detail for each check — what you found, what you expected

Return your QA report as JSON:

{
  "test_results": [
    { "test": "description of what was tested", "passed": true, "detail": "what was found" }
  ],
  "checklist_results": [
    { "item": "checklist item text", "passed": true, "detail": "verification detail" }
  ],
  "files_verified": [
    { "file": "filename", "exists": true, "valid": true, "detail": "content summary" }
  ],
  "tests_passed": true,
  "failing_tests": [],
  "verification_summary": "detailed summary of what was checked and results",
  "recommendation": "pass | fail"
}

IMPORTANT: Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
}

/**
 * Build the dependency analysis prompt.
 * Analyzes multiple task plans and determines optimal execution order.
 */
export function buildDependencyAnalysisPrompt(
  tasks: Array<{
    id: string;
    title: string;
    description?: string | null;
    plan: PlanningResult;
  }>,
  projectPath: string,
  projectContext?: string,
): string {
  const taskDescriptions = tasks.map((t, i) => {
    const filesCreated = t.plan.likely_files_to_change?.join(", ") || "(none specified)";
    const agent = t.plan.recommended_agent || "build";
    return `${i + 1}. [ID: ${t.id}] "${t.title}"
   Description: ${t.description || "(none)"}
   Creates/Modifies: ${filesCreated}
   Agent: ${agent}
   Steps: ${t.plan.implementation_steps?.length ?? 0} steps`;
  }).join("\n\n");

  return `You are TaskHive Dependency Analyzer.

Given these task plans for the SAME project, determine the optimal execution order.
Tasks will be executed ONE AT A TIME, sequentially. Each subsequent task will see files created by previous tasks.

${projectContext ? `${projectContext}\n` : ""}

TASK PLANS:
${taskDescriptions}

ANALYSIS RULES:
- Tasks that CREATE foundational files (HTML structure, config, setup) should run FIRST.
- Tasks that DEPEND on files created by other tasks should run AFTER those tasks.
- Frontend/UI/structure tasks generally before backend/logic tasks.
- If task A creates a file that task B references or modifies, task A must run first.
- If tasks are independent (no file overlap), order by complexity (simpler first).
- Consider: which order minimizes the chance of conflicts and maximizes integration?

Return JSON with the optimal execution order:

{
  "execution_order": ["taskId1", "taskId2"],
  "reasoning": [
    { "taskId": "id", "order": 1, "reason": "why this task should run at this position" }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
}
