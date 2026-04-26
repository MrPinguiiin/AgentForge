import * as fs from "node:fs";
import * as path from "node:path";
import type { ContextConfig, RelevanceScore } from "./types.js";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";

interface ResolvedFile {
  path: string;
  content: string;
  score: number;
}

export class ContextResolver {
  private rootPath: string;
  private config: ContextConfig;

  constructor(rootPath: string, config?: Partial<ContextConfig>) {
    this.rootPath = rootPath;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Resolve the most relevant files for a given task description.
   */
  async resolve(
    taskDescription: string,
    options?: { maxFiles?: number; additionalFiles?: string[] }
  ): Promise<ResolvedFile[]> {
    const maxFiles = options?.maxFiles ?? this.config.maxFiles;
    const keywords = this.extractKeywords(taskDescription);

    // Scan all eligible files
    const allFiles = this.scanFiles(this.rootPath);

    // Score each file by relevance
    const scored: RelevanceScore[] = allFiles.map((filePath) => {
      const relPath = path.relative(this.rootPath, filePath);
      const { score, reasons } = this.scoreFile(relPath, keywords);
      return { filePath: relPath, score, reasons };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Include any explicitly requested files
    const additionalSet = new Set(options?.additionalFiles ?? []);

    // Take top N files
    const topFiles = scored.slice(0, maxFiles);

    // Add additional files if not already included
    for (const additional of additionalSet) {
      if (!topFiles.find((f) => f.filePath === additional)) {
        topFiles.push({ filePath: additional, score: 0, reasons: ["explicitly requested"] });
      }
    }

    // Read file contents
    const results: ResolvedFile[] = [];
    for (const file of topFiles) {
      try {
        const absPath = path.join(this.rootPath, file.filePath);
        const stats = fs.statSync(absPath);

        if (stats.size > this.config.maxFileSize) continue;

        const content = fs.readFileSync(absPath, "utf-8");
        results.push({
          path: file.filePath,
          content,
          score: file.score,
        });
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  }

  // --- Private ---

  private extractKeywords(text: string): string[] {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "need", "must", "to", "of",
      "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
      "during", "before", "after", "above", "below", "between", "and", "but",
      "or", "not", "no", "nor", "so", "yet", "both", "either", "neither",
      "each", "every", "all", "any", "few", "more", "most", "other", "some",
      "such", "than", "too", "very", "just", "also", "this", "that", "these",
      "those", "it", "its", "i", "we", "you", "they", "he", "she", "me",
      "us", "him", "her", "them", "my", "our", "your", "their", "add",
      "create", "update", "fix", "implement", "change", "modify", "remove",
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-_./]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)];
  }

  private scoreFile(filePath: string, keywords: string[]): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const lowerPath = filePath.toLowerCase();
    const parts = lowerPath.split("/");
    const fileName = parts[parts.length - 1];

    // Check keyword matches in file path
    for (const keyword of keywords) {
      if (lowerPath.includes(keyword)) {
        score += 10;
        reasons.push(`path contains "${keyword}"`);
      }
      if (fileName.includes(keyword)) {
        score += 5; // Extra weight for filename match
        reasons.push(`filename contains "${keyword}"`);
      }
    }

    // Boost important files
    if (fileName === "index.ts" || fileName === "index.tsx" || fileName === "index.js") {
      score += 3;
      reasons.push("index file");
    }

    if (fileName.includes("config") || fileName.includes("schema")) {
      score += 2;
      reasons.push("config/schema file");
    }

    // Boost source files over test files
    if (lowerPath.includes("test") || lowerPath.includes("spec") || lowerPath.includes("__test__")) {
      score -= 3;
    }

    // Boost files closer to root (shorter paths)
    score += Math.max(0, 5 - parts.length);

    return { score, reasons };
  }

  private scanFiles(dirPath: string): string[] {
    const files: string[] = [];

    const shouldExclude = (name: string): boolean => {
      const excludeNames = [
        "node_modules", ".git", "dist", "build", ".next", ".nuxt",
        ".svelte-kit", "coverage", ".ai-coder", "__pycache__", ".venv",
      ];
      return excludeNames.includes(name);
    };

    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (shouldExclude(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          // Check if file matches include patterns (simple extension check)
          const ext = path.extname(entry.name);
          const codeExtensions = [
            ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go",
            ".java", ".rb", ".php", ".vue", ".svelte", ".c", ".cpp",
            ".h", ".hpp", ".cs", ".swift", ".kt", ".scala",
          ];
          if (codeExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    walk(dirPath);
    return files;
  }
}
