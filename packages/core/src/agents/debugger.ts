import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, CoderResult } from "./types.js";
import { DEBUGGER_SYSTEM_PROMPT, buildDebuggerPrompt } from "../ai/prompts/debugger.js";

export class DebuggerAgent extends BaseAgent<CoderResult> {
  name = "debugger";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return DEBUGGER_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildDebuggerPrompt({
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
