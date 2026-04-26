import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, CoderResult } from "./types.js";
import { CODER_SYSTEM_PROMPT, buildCoderPrompt } from "../ai/prompts/coder.js";

export class CoderAgent extends BaseAgent<CoderResult> {
  name = "coder";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return CODER_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildCoderPrompt({
      taskTitle: context.task.title,
      taskDescription: context.task.description ?? "",
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
