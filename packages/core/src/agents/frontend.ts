import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, CoderResult } from "./types.js";
import { FRONTEND_SYSTEM_PROMPT, buildFrontendPrompt } from "../ai/prompts/frontend.js";

export class FrontendAgent extends BaseAgent<CoderResult> {
  name = "frontend";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return FRONTEND_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildFrontendPrompt({
      taskTitle: context.task.title,
      taskDescription: context.task.description ?? "",
      acceptanceCriteria: context.task.acceptanceCriteria ?? undefined,
      projectContext: context.projectContext,
      relevantFiles: context.relevantFiles,
      framework: context.framework,
      language: context.language,
    });
  }

  parseResult(text: string): CoderResult {
    return this.extractJSON<CoderResult>(text);
  }
}
