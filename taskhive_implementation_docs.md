# TaskHive Implementation Documentation

## 1. Overview

TaskHive adalah sistem orchestration untuk menjalankan AI coding workflow berbasis Kanban board. User membuat task di kolom **Backlog**, lalu ketika user menekan tombol **Run**, sistem akan menjalankan OpenCode di belakang layar untuk membuat planning awal. Setelah planning selesai, task otomatis dipindahkan ke kolom **Ready For Agent** agar user bisa mengecek rencana eksekusi sebelum agent melakukan perubahan kode.

Konsep utamanya:

```text
Kanban Board = control plane
Task Card    = executable work unit
Router       = dispatcher
OpenCode     = execution engine
Agents       = specialized workers
```

TaskHive tidak menggantikan OpenCode. TaskHive bertindak sebagai layer orchestration di atas OpenCode.

---

## 2. Goals

### Primary Goals

- User dapat membuat task coding dari UI Kanban.
- User dapat menekan tombol **Run** pada task di Backlog.
- Sistem otomatis menjalankan OpenCode untuk melakukan task breakdown dan planning.
- Hasil planning ditangkap oleh backend TaskHive.
- Task otomatis pindah dari **Backlog** ke **Ready For Agent**.
- User dapat membaca planning terlebih dahulu sebelum task dieksekusi oleh coding agent.
- Setelah user approve, task dapat dieksekusi oleh OpenCode agent yang sesuai.

### Non-goals untuk MVP

- Tidak langsung auto-merge ke main branch.
- Tidak menjalankan banyak task paralel tanpa limit.
- Tidak mengeksekusi task high-risk tanpa approval user.
- Tidak mengganti CI/CD existing.
- Tidak menjadikan agent bebas push ke production.

---

## 3. High-Level Architecture

```text
Frontend Kanban UI
        |
        | REST / WebSocket
        v
TaskHive API Server
        |
        | create job
        v
Task Queue
        |
        v
TaskHive Worker
        |
        | spawn process
        v
OpenCode CLI
        |
        | stdout / stderr / files / git diff
        v
Result Collector
        |
        v
Database + Kanban State Update
```

### Komponen Utama

1. **Frontend Kanban UI**
   - Menampilkan board.
   - Membuat task.
   - Tombol Run.
   - Tombol Approve Plan.
   - Menampilkan log, planning, result, dan diff.

2. **TaskHive API Server**
   - Menyimpan task.
   - Mengubah status task.
   - Mengirim job ke queue.
   - Menyediakan endpoint untuk Run, Approve, Retry, Cancel.

3. **Task Queue**
   - Menyimpan job async.
   - Contoh: Redis Queue, BullMQ, Celery, Sidekiq, atau Temporal.

4. **TaskHive Worker**
   - Mengambil job dari queue.
   - Menjalankan OpenCode CLI.
   - Menangkap stdout, stderr, exit code, artifact, dan git diff.

5. **OpenCode CLI**
   - Engine agent di belakang layar.
   - Digunakan untuk planning dan execution.

6. **Database**
   - Menyimpan tasks, runs, plans, logs, artifacts, dan board columns.

7. **Git Workspace Manager**
   - Membuat branch per task.
   - Menjaga agar agent tidak bekerja di main branch.
   - Menyediakan isolated working directory.

---

## 4. Kanban Board Design

### Columns

```text
Backlog
Ready For Agent
In Progress
Review
QA
Done
Needs Human
Failed / Retry
Cancelled
```

### Meaning of Each Column

#### Backlog
Task baru dari user. Belum diproses agent.

#### Ready For Agent
Task sudah dibreakdown dan sudah punya planning hasil OpenCode. User bisa review rencana sebelum agent melakukan perubahan kode.

#### In Progress
Task sedang dieksekusi oleh OpenCode agent.

#### Review
Agent selesai membuat perubahan. Menunggu review user atau reviewer-agent.

#### QA
Task masuk validasi test, lint, dan verification.

#### Done
Task selesai dan diterima.

#### Needs Human
Task membutuhkan klarifikasi, requirement ambigu, permission ditolak, atau ada risiko besar.

#### Failed / Retry
Task gagal karena error, timeout, test failure, atau OpenCode gagal menyelesaikan task.

#### Cancelled
Task dibatalkan user.

---

## 5. State Machine

```text
Backlog
  | user clicks Run
  v
Planning Queued
  | worker starts OpenCode Plan
  v
Planning Running
  | plan success
  v
Ready For Agent
  | user approves plan
  v
Execution Queued
  | worker starts OpenCode Build
  v
In Progress
  | execution success
  v
Review
  | review approved
  v
QA
  | tests passed
  v
Done
```

Failure path:

```text
Planning Running -> Failed / Retry
In Progress      -> Failed / Retry
Review           -> Needs Human
QA               -> Failed / Retry
```

Ambiguity path:

```text
Planning Running -> Needs Human
In Progress      -> Needs Human
```

---

## 6. User Flow

### Flow 1: Create Task

1. User membuka board.
2. User membuat task di **Backlog**.
3. User mengisi title, description, acceptance criteria, repo, branch target, dan label.
4. Task tersimpan sebagai `status = backlog`.

### Flow 2: Run Planning

1. User klik **Run** di card Backlog.
2. Backend membuat `task_run` baru dengan type `planning`.
3. Backend memasukkan job ke queue.
4. Worker mengambil job.
5. Worker menjalankan OpenCode dengan planning prompt.
6. OpenCode menghasilkan breakdown dan implementation plan.
7. Worker menangkap result.
8. Backend menyimpan plan.
9. Task pindah ke **Ready For Agent**.

### Flow 3: Approve Plan

1. User membuka task di **Ready For Agent**.
2. User membaca planning.
3. User bisa:
   - Approve.
   - Edit plan.
   - Request re-plan.
   - Cancel.
4. Jika approve, task masuk queue execution.

### Flow 4: Execute Agent

1. Backend memilih agent berdasarkan label task.
2. Worker membuat isolated branch.
3. Worker menjalankan OpenCode agent.
4. OpenCode melakukan perubahan kode.
5. Worker menangkap stdout, stderr, git diff, test result, dan summary.
6. Task pindah ke **Review**.

---

## 7. OpenCode Integration Strategy

TaskHive menjalankan OpenCode sebagai subprocess.

### Planning Mode

Planning harus menggunakan agent yang tidak boleh mengubah file. Tujuannya hanya:

- membaca task,
- membaca repo,
- memahami scope,
- membuat breakdown,
- membuat rencana implementasi,
- menentukan agent yang cocok,
- menentukan risiko,
- menentukan file yang kemungkinan akan disentuh.

Command concept:

```bash
opencode run --agent plan "<planning prompt>"
```

### Execution Mode

Execution menggunakan agent yang boleh mengubah file sesuai permission.

Command concept:

```bash
opencode run --agent build "<execution prompt>"
```

Untuk custom agent:

```bash
opencode run --agent frontend "<execution prompt>"
opencode run --agent backend "<execution prompt>"
opencode run --agent qa "<qa prompt>"
opencode run --agent review "<review prompt>"
```

---

## 8. OpenCode Agent Model

TaskHive sebaiknya menggunakan 2 level agent:

1. **Primary agents** untuk mode utama:
   - `plan`
   - `build`

2. **Subagents** untuk task khusus:
   - `explore`
   - `frontend`
   - `backend`
   - `qa`
   - `review`
   - `docs`
   - `security`

### Recommended Agents

#### plan
Mode: primary

Purpose:

- Membuat planning.
- Tidak melakukan file edit.
- Tidak menjalankan command berisiko.
- Menghasilkan JSON planning yang bisa diparse backend.

#### build
Mode: primary

Purpose:

- Melakukan implementasi.
- Bisa invoke subagents.
- Bisa edit file.
- Bisa run test.

#### explore
Mode: subagent

Purpose:

- Membaca codebase.
- Mencari file relevan.
- Tidak mengubah file.

#### frontend
Mode: subagent

Purpose:

- Implementasi UI.
- Component changes.
- CSS/styling.
- Frontend test.

#### backend
Mode: subagent

Purpose:

- API.
- Database.
- Service layer.
- Backend test.

#### qa
Mode: subagent

Purpose:

- Menjalankan test.
- Membuat verification report.
- Mencari regression.

#### review
Mode: subagent

Purpose:

- Review diff.
- Security issue.
- Edge case.
- Tidak edit file.

#### docs
Mode: subagent

Purpose:

- Update README.
- Update internal docs.
- Update changelog.

---

## 9. Suggested OpenCode Project Structure

Di root repo yang akan dikerjakan agent:

```text
repo/
  AGENTS.md
  opencode.json
  .opencode/
    agent/
      frontend.md
      backend.md
      qa.md
      review.md
      docs.md
      security.md
    skills/
      taskhive-planning/
        SKILL.md
      taskhive-execution/
        SKILL.md
```

### AGENTS.md

File ini berisi instruksi project untuk OpenCode.

Contoh:

```md
# Project Agent Instructions

## Build Commands
- Install: pnpm install
- Lint: pnpm lint
- Test: pnpm test
- Typecheck: pnpm typecheck

## Rules
- Never push directly to main.
- Keep changes minimal.
- Follow existing code style.
- Add tests for behavior changes.
- Prefer small commits.

## Architecture Notes
- Frontend is in apps/web.
- Backend is in apps/api.
- Shared packages are in packages/.
```

---

## 10. Example OpenCode Agent Files

### `.opencode/agent/frontend.md`

```md
---
description: Frontend implementation agent for UI, components, forms, state, styling, and frontend tests.
mode: subagent
permission:
  edit: allow
  bash: ask
  webfetch: deny
---

You are the frontend implementation agent.

Responsibilities:
- Implement UI changes.
- Modify components carefully.
- Follow existing design system.
- Add or update frontend tests.
- Do not touch backend files unless explicitly required.

Output:
- Summary of files changed.
- Tests run.
- Known risks.
```

### `.opencode/agent/backend.md`

```md
---
description: Backend implementation agent for APIs, services, database logic, and backend tests.
mode: subagent
permission:
  edit: allow
  bash: ask
  webfetch: deny
---

You are the backend implementation agent.

Responsibilities:
- Implement API and service changes.
- Update database logic only when needed.
- Add or update backend tests.
- Preserve existing API contracts unless the task asks otherwise.

Output:
- Summary of files changed.
- Tests run.
- Migration notes if any.
- Known risks.
```

### `.opencode/agent/review.md`

```md
---
description: Code review agent that reviews diffs and suggests improvements without editing files.
mode: subagent
permission:
  edit: deny
  bash: ask
  webfetch: deny
---

You are the code review agent.

Responsibilities:
- Review code changes.
- Check correctness, security, maintainability, and tests.
- Do not edit files.
- Provide clear approval or requested changes.

Output:
- Verdict: approve | request_changes
- Issues found
- Suggestions
- Risk level
```

### `.opencode/agent/qa.md`

```md
---
description: QA agent that runs verification, tests, lint, and regression checks.
mode: subagent
permission:
  edit: deny
  bash: ask
  webfetch: deny
---

You are the QA verification agent.

Responsibilities:
- Run relevant tests.
- Run lint/typecheck if available.
- Verify acceptance criteria.
- Report failures clearly.

Output:
- Tests run
- Pass/fail result
- Failing logs summary
- Verification checklist
```

---

## 11. Planning Prompt Template

TaskHive harus membuat prompt planning yang strict dan menghasilkan JSON.

```md
You are TaskHive Planning Agent.

You are running inside OpenCode behind a Kanban orchestration system.

Your job is to create a safe implementation plan only.
Do not edit files.
Do not run destructive commands.
Do not commit.
Do not push.

Task:
{{task.title}}

Description:
{{task.description}}

Acceptance Criteria:
{{task.acceptanceCriteria}}

Repository:
{{repo.name}}

Current Board Column:
Backlog

Available Subagents:
- explore
- frontend
- backend
- qa
- review
- docs
- security

Return only valid JSON using this schema:

{
  "summary": "short task summary",
  "needs_human": false,
  "human_questions": [],
  "risk_level": "low | medium | high",
  "recommended_agent": "frontend | backend | build | qa | docs | security",
  "recommended_subagents": ["explore", "qa", "review"],
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
```

---

## 12. Execution Prompt Template

Setelah user approve plan, TaskHive menjalankan execution prompt.

```md
You are TaskHive Execution Agent.

You are running inside OpenCode behind a Kanban orchestration system.

Task:
{{task.title}}

Description:
{{task.description}}

Acceptance Criteria:
{{task.acceptanceCriteria}}

Approved Plan:
{{task.plan}}

Rules:
- Work only on branch {{branch.name}}.
- Keep changes minimal.
- Do not push to main.
- Do not change unrelated files.
- Run relevant tests.
- If blocked, stop and explain blocker.
- If requirement is ambiguous, stop and ask for clarification.

Suggested Agent Routing:
Primary agent: {{recommended_agent}}
Subagents: {{recommended_subagents}}

Expected Output:
Return a final summary with:
- files changed
- implementation summary
- tests run
- test result
- remaining risks
- whether acceptance criteria are satisfied
```

---

## 13. Task Routing Logic

Routing menggunakan kombinasi:

- task labels,
- planning output,
- changed area,
- risk level,
- current board column.

### Label Examples

```text
type:frontend
type:backend
type:bug
type:test
type:docs
type:security
risk:low
risk:medium
risk:high
scope:small
scope:large
area:auth
area:billing
area:dashboard
```

### Router Pseudocode

```ts
function selectAgent(task, plan) {
  if (plan.needs_human) return "needs_human";

  if (task.labels.includes("type:frontend")) return "frontend";
  if (task.labels.includes("type:backend")) return "backend";
  if (task.labels.includes("type:docs")) return "docs";
  if (task.labels.includes("type:test")) return "qa";
  if (task.labels.includes("type:security")) return "security";

  if (plan.recommended_agent) return plan.recommended_agent;

  return "build";
}
```

### Column Transition Pseudocode

```ts
function nextColumnAfterPlanning(plan) {
  if (plan.needs_human) return "Needs Human";
  return "Ready For Agent";
}

function nextColumnAfterExecution(result) {
  if (result.blocked) return "Needs Human";
  if (!result.success) return "Failed / Retry";
  return "Review";
}

function nextColumnAfterQA(result) {
  if (result.testsPassed) return "Done";
  return "Failed / Retry";
}
```

---

## 14. Database Schema

### `tasks`

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  repo_id UUID NOT NULL,
  column_key TEXT NOT NULL,
  status TEXT NOT NULL,
  labels JSONB DEFAULT '[]',
  priority TEXT DEFAULT 'normal',
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `task_plans`

```sql
CREATE TABLE task_plans (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id),
  run_id UUID NOT NULL,
  summary TEXT,
  plan_json JSONB NOT NULL,
  recommended_agent TEXT,
  risk_level TEXT,
  needs_human BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `task_runs`

```sql
CREATE TABLE task_runs (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id),
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  agent_name TEXT,
  command TEXT,
  exit_code INT,
  stdout TEXT,
  stderr TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `task_artifacts`

```sql
CREATE TABLE task_artifacts (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id),
  run_id UUID NOT NULL REFERENCES task_runs(id),
  artifact_type TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `repos`

```sql
CREATE TABLE repos (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 15. API Design

### Create Task

```http
POST /api/tasks
```

Request:

```json
{
  "title": "Implement login error states",
  "description": "Login form should show specific validation errors.",
  "acceptanceCriteria": "Invalid password, missing email, and timeout errors are handled.",
  "repoId": "repo_123",
  "labels": ["type:frontend", "area:auth", "risk:medium"]
}
```

Response:

```json
{
  "id": "task_123",
  "column": "Backlog",
  "status": "backlog"
}
```

### Run Planning

```http
POST /api/tasks/:taskId/run-planning
```

Behavior:

- Validate task is in Backlog.
- Create task run with `run_type = planning`.
- Enqueue planning job.
- Return run id.

Response:

```json
{
  "runId": "run_123",
  "status": "queued"
}
```

### Get Task Plan

```http
GET /api/tasks/:taskId/plan
```

Response:

```json
{
  "taskId": "task_123",
  "summary": "Implement specific login error states.",
  "riskLevel": "medium",
  "recommendedAgent": "frontend",
  "implementationSteps": [],
  "testPlan": []
}
```

### Approve Plan

```http
POST /api/tasks/:taskId/approve-plan
```

Behavior:

- Validate task is in Ready For Agent.
- Mark plan approved.
- Create execution run.
- Enqueue execution job.
- Move task to Execution Queued or In Progress.

### Retry Planning

```http
POST /api/tasks/:taskId/retry-planning
```

### Cancel Task

```http
POST /api/tasks/:taskId/cancel
```

---

## 16. Worker Implementation

### Planning Worker Pseudocode

```ts
async function runPlanningJob(job) {
  const task = await db.tasks.find(job.taskId);
  const repo = await db.repos.find(task.repoId);

  const run = await db.taskRuns.create({
    taskId: task.id,
    runType: "planning",
    status: "running",
    agentName: "plan",
    startedAt: new Date()
  });

  const prompt = renderPlanningPrompt(task, repo);

  const result = await runOpenCode({
    cwd: repo.path,
    agent: "plan",
    prompt
  });

  await db.taskRuns.update(run.id, {
    status: result.exitCode === 0 ? "success" : "failed",
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    finishedAt: new Date()
  });

  if (result.exitCode !== 0) {
    await moveTask(task.id, "Failed / Retry");
    return;
  }

  const plan = parsePlanningJson(result.stdout);

  await db.taskPlans.create({
    taskId: task.id,
    runId: run.id,
    summary: plan.summary,
    planJson: plan,
    recommendedAgent: plan.recommended_agent,
    riskLevel: plan.risk_level,
    needsHuman: plan.needs_human
  });

  if (plan.needs_human) {
    await moveTask(task.id, "Needs Human");
  } else {
    await moveTask(task.id, "Ready For Agent");
  }
}
```

### OpenCode Runner Pseudocode

```ts
import { spawn } from "node:child_process";

async function runOpenCode({ cwd, agent, prompt }) {
  return new Promise((resolve) => {
    const child = spawn("opencode", ["run", "--agent", agent, prompt], {
      cwd,
      env: {
        ...process.env,
        TASKHIVE_RUN: "true"
      }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}
```

---

## 17. Capturing OpenCode Results

TaskHive harus menangkap:

```text
stdout
stderr
exit_code
start_time
finish_time
git diff
git status
test logs
planning JSON
summary
```

### Result Capture Strategy

Setelah OpenCode selesai:

```bash
git status --short
git diff --stat
git diff
```

Simpan sebagai artifact:

```text
artifact_type = git_status
artifact_type = git_diff_stat
artifact_type = git_diff
artifact_type = test_log
artifact_type = final_summary
```

---

## 18. Branch Strategy

Setiap task harus berjalan di branch sendiri.

Format branch:

```text
taskhive/{task-id}-{slug}
```

Contoh:

```text
taskhive/task-123-login-error-state
```

Execution worker:

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b taskhive/task-123-login-error-state
```

Setelah agent selesai:

```bash
git status --short
git diff --stat
git diff
```

MVP bisa tidak auto-commit dulu. Production-ish bisa auto-commit setelah diff valid.

---

## 19. Security and Safety

### Required Guardrails

- Agent tidak boleh push ke main.
- Agent tidak boleh auto-merge.
- Planning agent tidak boleh edit file.
- Review agent tidak boleh edit file.
- High-risk task wajib human approval.
- Task harus punya timeout.
- Worker harus isolated per repo/task.
- Secret tidak boleh dimasukkan ke prompt.
- Semua command execution harus logged.

### Risk Rules

```ts
function requiresHumanApproval(task, plan) {
  if (task.labels.includes("risk:high")) return true;
  if (plan.risk_level === "high") return true;
  if (plan.likely_files_to_change.some(file => file.includes("payment"))) return true;
  if (plan.likely_files_to_change.some(file => file.includes("auth"))) return true;
  if (plan.likely_files_to_change.some(file => file.includes("migration"))) return true;
  return false;
}
```

---

## 20. MVP Milestones

### Milestone 1: Board + Task CRUD

Deliverables:

- Kanban board UI.
- Create task in Backlog.
- View task detail.
- Add labels.
- Store tasks in DB.

### Milestone 2: Run Planning

Deliverables:

- Run button on Backlog card.
- API endpoint `run-planning`.
- Worker executes `opencode run --agent plan`.
- Capture stdout/stderr.
- Parse JSON plan.
- Move task to Ready For Agent.

### Milestone 3: Plan Review

Deliverables:

- Show generated plan in task detail.
- Approve plan.
- Request re-plan.
- Move to Needs Human if planning asks questions.

### Milestone 4: Execution

Deliverables:

- Agent routing based on labels and plan.
- Worker runs OpenCode execution.
- Create branch per task.
- Capture git diff.
- Move task to Review.

### Milestone 5: QA + Review

Deliverables:

- QA agent run.
- Review agent run.
- Test result stored.
- Move task to Done or Failed / Retry.

### Milestone 6: Production-ish

Deliverables:

- PR creation.
- CI integration.
- Retry policy.
- Audit logs.
- Metrics dashboard.

---

## 21. Recommended Tech Stack

### Option A: TypeScript Stack

```text
Frontend: Next.js
Backend: Next.js API / NestJS / Hono
Queue: BullMQ + Redis
DB: PostgreSQL
ORM: Prisma / Drizzle
Worker: Node.js
Realtime: WebSocket / Server-Sent Events
Execution: OpenCode CLI subprocess
```

### Option B: Python Stack

```text
Frontend: Next.js
Backend: FastAPI
Queue: Celery + Redis
DB: PostgreSQL
ORM: SQLAlchemy
Worker: Python subprocess
Realtime: WebSocket
Execution: OpenCode CLI subprocess
```

Recommended untuk MVP: **TypeScript + BullMQ + PostgreSQL**.

---

## 22. Frontend UX

### Task Card

Card menampilkan:

```text
Title
Labels
Risk level
Recommended agent
Planning status
Execution status
Last run result
```

### Task Detail Drawer

Tabs:

```text
Overview
Planning
Runs
Logs
Diff
QA
Review
```

### Buttons by Column

#### Backlog

```text
Run Planning
Edit
Cancel
```

#### Ready For Agent

```text
Approve Plan
Request Re-plan
Edit Plan
Cancel
```

#### In Progress

```text
View Logs
Cancel Run
```

#### Review

```text
View Diff
Run Review Agent
Approve
Request Changes
```

#### Failed / Retry

```text
Retry
View Error
Move to Needs Human
```

---

## 23. Planning JSON Parser

OpenCode output bisa punya teks tambahan. Untuk MVP, prompt harus memaksa output JSON saja. Tetap siapkan fallback parser.

```ts
function parsePlanningJson(stdout: string) {
  try {
    return JSON.parse(stdout);
  } catch {
    const match = stdout.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in OpenCode output");
    return JSON.parse(match[0]);
  }
}
```

---

## 24. Error Handling

### Planning Error

Move to `Failed / Retry` when:

- OpenCode exit code non-zero.
- JSON parse failed.
- Timeout.
- Repo path invalid.
- Agent config missing.

Move to `Needs Human` when:

- Requirement ambiguous.
- OpenCode asks clarification.
- Risk high.
- Missing acceptance criteria.

### Execution Error

Move to `Failed / Retry` when:

- tests fail,
- build fails,
- agent exits with error,
- git workspace dirty before start,
- branch creation fails.

---

## 25. Observability

Track these metrics:

```text
planning_success_rate
execution_success_rate
average_planning_duration
average_execution_duration
retry_count
failed_count
needs_human_count
tasks_done_per_day
agent_success_rate_by_type
```

Add logs:

```text
task.created
task.planning.queued
task.planning.started
task.planning.finished
task.moved.ready_for_agent
task.execution.started
task.execution.finished
task.review.started
task.qa.started
task.done
task.failed
```

---

## 26. Example End-to-End Scenario

### User Input

```text
Title: Implement login error states

Description:
Login form currently shows generic error. Make it show specific messages for missing email, wrong password, and server timeout.

Acceptance Criteria:
- Missing email shows validation before submit.
- Wrong password shows incorrect password message.
- Server timeout shows retry message.
- Relevant tests are added.

Labels:
type:frontend
area:auth
risk:medium
```

### User Clicks Run

TaskHive runs:

```bash
opencode run --agent plan "<planning prompt>"
```

### OpenCode Planning Result

```json
{
  "summary": "Implement specific login error states in login form.",
  "needs_human": false,
  "human_questions": [],
  "risk_level": "medium",
  "recommended_agent": "frontend",
  "recommended_subagents": ["explore", "qa", "review"],
  "files_to_inspect": ["apps/web/src/features/auth"],
  "likely_files_to_change": [
    "apps/web/src/features/auth/LoginForm.tsx",
    "apps/web/src/features/auth/LoginForm.test.tsx"
  ],
  "implementation_steps": [
    "Inspect login form error handling.",
    "Add client-side missing email validation.",
    "Map API wrong password error to user-facing message.",
    "Add timeout-specific retry message.",
    "Add tests for the three states."
  ],
  "test_plan": [
    "Run frontend auth tests.",
    "Run lint for web app."
  ],
  "acceptance_checklist": [
    "Missing email validation works.",
    "Wrong password message works.",
    "Timeout retry message works.",
    "Tests added."
  ],
  "routing_decision": {
    "next_column": "Ready For Agent",
    "reason": "Planning completed and no human clarification needed."
  }
}
```

### Task Moves

```text
Backlog -> Ready For Agent
```

User reviews the plan, then clicks **Approve Plan**.

### Execution

TaskHive runs:

```bash
opencode run --agent build "<execution prompt with approved plan>"
```

or:

```bash
opencode run --agent frontend "<execution prompt with approved plan>"
```

### Final Transition

```text
Ready For Agent -> In Progress -> Review -> QA -> Done
```

---

## 27. Implementation Checklist

### Backend

- [ ] Create task model.
- [ ] Create task run model.
- [ ] Create task plan model.
- [ ] Create artifact model.
- [ ] Implement board columns.
- [ ] Implement `POST /api/tasks`.
- [ ] Implement `POST /api/tasks/:id/run-planning`.
- [ ] Implement queue.
- [ ] Implement planning worker.
- [ ] Implement OpenCode subprocess runner.
- [ ] Implement planning JSON parser.
- [ ] Implement automatic move to Ready For Agent.
- [ ] Implement approve plan endpoint.
- [ ] Implement execution worker.
- [ ] Implement artifact capture.

### Frontend

- [ ] Build Kanban board.
- [ ] Build task creation modal.
- [ ] Add Run button for Backlog tasks.
- [ ] Add task detail drawer.
- [ ] Add Planning tab.
- [ ] Add Runs tab.
- [ ] Add Logs tab.
- [ ] Add Diff tab.
- [ ] Add Approve Plan button.
- [ ] Add Re-plan button.

### OpenCode

- [ ] Install OpenCode on worker machine.
- [ ] Configure model provider.
- [ ] Add `AGENTS.md` to target repo.
- [ ] Add `opencode.json` if needed.
- [ ] Add custom agent markdown files.
- [ ] Test `opencode run --agent plan` manually.
- [ ] Test `opencode run --agent build` manually.
- [ ] Validate permission behavior.

### DevOps

- [ ] Add Redis.
- [ ] Add PostgreSQL.
- [ ] Add worker service.
- [ ] Add logs.
- [ ] Add timeout.
- [ ] Add branch cleanup policy.
- [ ] Add audit trail.

---

## 28. Recommended MVP Scope

Untuk versi pertama, jangan langsung bikin semua agent. Cukup:

```text
plan
build
explore
review
qa
```

Flow MVP:

```text
Backlog
  -> Run Planning with plan agent
  -> Ready For Agent
  -> Approve Plan
  -> Execute with build agent
  -> Review
```

Setelah stabil, baru tambah:

```text
frontend
backend
docs
security
```

---

## 29. Future Enhancements

- GitHub PR auto-creation.
- GitHub Projects integration.
- Linear integration.
- Slack notification.
- Multi-repo task execution.
- Parallel subtask execution.
- Agent performance scoring.
- Cost tracking per task.
- Automatic task splitting.
- Human approval rules by risk.
- Agent memory per repo.
- Reusable OpenCode skills for project conventions.

---

## 30. Core Principle

TaskHive harus tetap human-controlled.

Best default behavior:

```text
Agent plans.
Human approves.
Agent executes.
Human reviews.
CI verifies.
Only then Done.
```

Untuk MVP, keberhasilan bukan agent yang langsung auto-merge, tapi agent yang bisa:

1. membaca task dari Kanban,
2. membuat planning yang jelas,
3. memindahkan task ke Ready For Agent,
4. menjalankan OpenCode secara aman,
5. menangkap hasil eksekusi,
6. memberi user kontrol penuh sebelum perubahan kode diterima.

