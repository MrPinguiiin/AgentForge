import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, CoderResult } from "./types.js";
import { DOCS_SYSTEM_PROMPT, buildDocsPrompt } from "../ai/prompts/docs.js";

export class DocsAgent extends BaseAgent<CoderResult> {
  name = "docs";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return DOCS_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    return buildDocsPrompt({
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
