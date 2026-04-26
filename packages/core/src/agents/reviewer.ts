import type { LanguageModel } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentContext, ReviewerResult } from "./types.js";
import { REVIEWER_SYSTEM_PROMPT, buildReviewerPrompt } from "../ai/prompts/reviewer.js";

export class ReviewerAgent extends BaseAgent<ReviewerResult> {
  name = "reviewer";

  constructor(
    model: LanguageModel,
    options?: { temperature?: number; maxOutputTokens?: number }
  ) {
    super(model, options);
  }

  getSystemPrompt(): string {
    return REVIEWER_SYSTEM_PROMPT;
  }

  buildUserPrompt(context: AgentContext): string {
    const changes = (context.taskFiles ?? []).map((tf) => ({
      filePath: tf.filePath,
      diff: tf.diff ?? undefined,
      content: tf.modifiedContent ?? undefined,
    }));

    return buildReviewerPrompt({
      taskTitle: context.task.title,
      taskDescription: context.task.description ?? "",
      changes,
      projectContext: context.projectContext,
    });
  }

  parseResult(text: string): ReviewerResult {
    return this.extractJSON<ReviewerResult>(text);
  }
}
