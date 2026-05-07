import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, QAResult } from "./types.js";
import { QA_SYSTEM_PROMPT, buildQAPrompt } from "../ai/prompts/qa.js";

export class QAAgent extends BaseAgent<QAResult> {
  name = "qa";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return QA_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildQAPrompt({
      taskTitle: context.task.title,
      taskDescription: context.task.description ?? "",
      acceptanceCriteria: context.task.acceptanceCriteria ?? undefined,
      projectContext: context.projectContext,
      relevantFiles: context.relevantFiles,
      framework: context.framework,
      language: context.language,
    });
  }

  parseResult(text: string): QAResult {
    return this.extractJSON<QAResult>(text);
  }
}
