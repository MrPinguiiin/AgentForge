import { streamText, type LanguageModel } from "ai";
import type { AgentContext, StreamChunk, Agent } from "./types.js";

export abstract class BaseAgent<TResult> implements Agent<TResult> {
  abstract name: string;

  constructor(
    protected model: LanguageModel,
    protected options: {
      temperature?: number;
      maxOutputTokens?: number;
    } = {}
  ) {}

  abstract getSystemPrompt(): string;
  abstract buildUserPrompt(context: AgentContext): string;
  abstract parseResult(text: string): TResult;

  async *execute(context: AgentContext): AsyncGenerator<StreamChunk, TResult, undefined> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    let fullText = "";

    try {
      const result = streamText({
        model: this.model,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        temperature: this.options.temperature ?? 0.7,
        maxOutputTokens: this.options.maxOutputTokens ?? 4096,
      });

      for await (const chunk of (await result).textStream) {
        fullText += chunk;
        yield {
          type: "text",
          content: chunk,
        };
      }

      yield {
        type: "done",
        content: "",
        metadata: { totalLength: fullText.length },
      };

      return this.parseResult(fullText);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield {
        type: "error",
        content: errorMessage,
      };
      throw error;
    }
  }

  /**
   * Extract JSON from a text response that may contain markdown code fences.
   */
  protected extractJSON<T>(text: string): T {
    // Try to extract JSON from code fences first
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      // Try to find JSON object or array in the text
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      const match = objectMatch ?? arrayMatch;

      if (match) {
        return JSON.parse(match[0]) as T;
      }

      throw new Error(`Failed to parse JSON from response:\n${text.substring(0, 200)}...`);
    }
  }
}
