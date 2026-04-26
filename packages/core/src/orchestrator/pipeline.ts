export type PipelineStage =
  | "idle"
  | "planning"
  | "coding"
  | "reviewing"
  | "applying"
  | "committing"
  | "pushing"
  | "completed"
  | "failed";

export const PIPELINE_STAGES: PipelineStage[] = [
  "idle",
  "planning",
  "coding",
  "reviewing",
  "applying",
  "committing",
  "pushing",
  "completed",
];

const VALID_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  idle: ["planning", "coding"],
  planning: ["coding", "failed"],
  coding: ["reviewing", "applying", "failed"],
  reviewing: ["coding", "applying", "completed", "failed"],
  applying: ["committing", "failed"],
  committing: ["pushing", "completed", "failed"],
  pushing: ["completed", "failed"],
  completed: ["idle"],
  failed: ["idle", "planning", "coding"],
};

/**
 * Check if a transition between two pipeline stages is valid.
 */
export function isValidTransition(from: PipelineStage, to: PipelineStage): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the available transitions from a given stage.
 */
export function getAvailableTransitions(stage: PipelineStage): PipelineStage[] {
  return VALID_TRANSITIONS[stage] ?? [];
}

/**
 * Get the next stage in the standard pipeline flow.
 */
export function getNextStage(current: PipelineStage): PipelineStage | null {
  const idx = PIPELINE_STAGES.indexOf(current);
  if (idx === -1 || idx >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[idx + 1];
}
