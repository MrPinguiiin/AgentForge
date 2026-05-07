import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, CoderResult } from "./types.js";
import { BACKEND_SYSTEM_PROMPT, buildBackendPrompt } from "../ai/prompts/backend.js";

export class BackendAgent extends BaseAgent<CoderResult> {
  name = "backend";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return BACKEND_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildBackendPrompt({
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
