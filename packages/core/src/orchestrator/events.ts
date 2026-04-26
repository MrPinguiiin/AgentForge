import type { StreamChunk, PlannerResult, CoderResult, ReviewerResult } from "../agents/types.js";
import type { Task } from "../db/schema.js";

export interface OrchestratorEvents {
  // Pipeline lifecycle
  "pipeline:start": (taskId: string) => void;
  "pipeline:stage": (taskId: string, stage: string) => void;
  "pipeline:complete": (taskId: string) => void;
  "pipeline:error": (taskId: string, error: Error) => void;

  // Agent events
  "agent:start": (taskId: string, agentType: string) => void;
  "agent:stream": (taskId: string, agentType: string, chunk: StreamChunk) => void;
  "agent:complete": (taskId: string, agentType: string) => void;
  "agent:error": (taskId: string, agentType: string, error: Error) => void;

  // Task events
  "task:created": (task: Task) => void;
  "task:updated": (task: Task) => void;
  "task:statusChanged": (task: Task, oldStatus: string, newStatus: string) => void;

  // Planning events
  "plan:created": (taskId: string, result: PlannerResult) => void;

  // Coding events
  "code:generated": (taskId: string, result: CoderResult) => void;
  "code:applied": (taskId: string, filesChanged: string[]) => void;

  // Review events
  "review:completed": (taskId: string, result: ReviewerResult) => void;

  // Git events
  "git:committed": (taskId: string, hash: string, message: string) => void;
  "git:pushed": (taskId: string, branch: string) => void;
}
