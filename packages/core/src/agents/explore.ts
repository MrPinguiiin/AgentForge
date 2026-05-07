import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, ExploreResult } from "./types.js";
import { EXPLORE_SYSTEM_PROMPT, buildExplorePrompt } from "../ai/prompts/explore.js";

export class ExploreAgent extends BaseAgent<ExploreResult> {
  name = "explore";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return EXPLORE_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildExplorePrompt({
      taskTitle: context.task.title,
      taskDescription: context.task.description ?? "",
      acceptanceCriteria: context.task.acceptanceCriteria ?? undefined,
      projectContext: context.projectContext,
      relevantFiles: context.relevantFiles,
      framework: context.framework,
      language: context.language,
    });
  }

  parseResult(text: string): ExploreResult {
    return this.extractJSON<ExploreResult>(text);
  }
}
