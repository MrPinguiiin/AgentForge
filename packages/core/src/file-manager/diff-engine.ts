import {
  createPatch,
  applyPatch,
  structuredPatch,
  parsePatch,
  type ParsedDiff,
} from "diff";
import type { DiffResult, DiffHunk, ApplyResult } from "./types.js";

export class DiffEngine {
  /**
   * Generate a unified diff between two strings.
   */
  generateDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): DiffResult {
    const patch = createPatch(filePath, oldContent, newContent, "", "", {
      context: 3,
    });

    const structured = structuredPatch(filePath, filePath, oldContent, newContent, "", "", {
      context: 3,
    });

    let additions = 0;
    let deletions = 0;

    const hunks: DiffHunk[] = structured.hunks.map((hunk) => {
      const lines = hunk.lines;
      for (const line of lines) {
        if (line.startsWith("+")) additions++;
        if (line.startsWith("-")) deletions++;
      }

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines,
      };
    });

    return { filePath, hunks, additions, deletions, patch };
  }

  /**
   * Apply a unified diff patch to content.
   */
  applyDiff(originalContent: string, patch: string): ApplyResult {
    try {
      const result = applyPatch(originalContent, patch);

      if (result === false) {
        return {
          success: false,
          filePath: "",
          error: "Patch could not be applied cleanly",
        };
      }

      return {
        success: true,
        filePath: "",
        backup: originalContent,
      };
    } catch (error) {
      return {
        success: false,
        filePath: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a structured diff with detailed hunk information.
   */
  generateStructuredDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): DiffResult {
    return this.generateDiff(filePath, oldContent, newContent);
  }

  /**
   * Validate that a patch can be applied to the given content.
   */
  validatePatch(content: string, patch: string): boolean {
    try {
      const result = applyPatch(content, patch);
      return result !== false;
    } catch {
      return false;
    }
  }
}
