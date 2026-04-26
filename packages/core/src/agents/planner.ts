import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, PlannerResult } from "./types.js";
import { PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from "../ai/prompts/planner.js";

export class PlannerAgent extends BaseAgent<PlannerResult> {
  name = "planner";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return PLANNER_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildPlannerPrompt({
      taskTitle: context.task.title,
      taskDescription: context.task.description ?? "",
      projectContext: context.projectContext,
      existingFiles: context.existingFiles,
      framework: context.framework,
    });
  }

  parseResult(text: string): PlannerResult {
    return this.extractJSON<PlannerResult>(text);
  }
}
