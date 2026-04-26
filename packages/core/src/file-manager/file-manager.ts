import * as fs from "node:fs";
import * as path from "node:path";
import { DiffEngine } from "./diff-engine.js";
import type {
  FileOperation,
  FileContent,
  ProjectFileTree,
  DiffResult,
  ApplyResult,
} from "./types.js";

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "coverage",
  ".ai-coder",
  "__pycache__",
  ".venv",
  ".env",
  ".DS_Store",
  "Thumbs.db",
];

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".vue": "vue",
  ".svelte": "svelte",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".md": "markdown",
  ".sql": "sql",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".zsh": "shellscript",
  ".dockerfile": "dockerfile",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".prisma": "prisma",
};

export class FileManager {
  private rootPath: string;
  private diffEngine: DiffEngine;
  private ignorePatterns: string[];

  constructor(rootPath: string, ignorePatterns?: string[]) {
    this.rootPath = path.resolve(rootPath);
    this.diffEngine = new DiffEngine();
    this.ignorePatterns = ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
  }

  // --- Security ---

  private assertSafePath(filePath: string): string {
    const resolved = path.resolve(this.rootPath, filePath);
    if (!resolved.startsWith(this.rootPath)) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }
    return resolved;
  }

  // --- Scanning ---

  async scanProject(dirPath?: string): Promise<ProjectFileTree> {
    const targetDir = dirPath
      ? this.assertSafePath(dirPath)
      : this.rootPath;

    return this.scanDirectory(targetDir);
  }

  private scanDirectory(dirPath: string): ProjectFileTree {
    const name = path.basename(dirPath);
    const relativePath = path.relative(this.rootPath, dirPath);

    const tree: ProjectFileTree = {
      name,
      path: relativePath || ".",
      type: "directory",
      children: [],
    };

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return tree;
    }

    for (const entry of entries) {
      if (this.shouldIgnore(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(this.rootPath, fullPath);

      if (entry.isDirectory()) {
        tree.children!.push(this.scanDirectory(fullPath));
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        tree.children!.push({
          name: entry.name,
          path: relPath,
          type: "file",
          size: stats.size,
          language: this.detectLanguage(entry.name),
        });
      }
    }

    return tree;
  }

  private shouldIgnore(name: string): boolean {
    return this.ignorePatterns.some(
      (pattern) => name === pattern || name.startsWith(".")
    );
  }

  // --- File Operations ---

  async readFile(filePath: string): Promise<FileContent> {
    const absPath = this.assertSafePath(filePath);

    const content = fs.readFileSync(absPath, "utf-8");
    const stats = fs.statSync(absPath);

    return {
      filePath,
      content,
      language: this.detectLanguage(filePath),
      size: stats.size,
      lastModified: stats.mtime,
    };
  }

  async readFiles(filePaths: string[]): Promise<FileContent[]> {
    return Promise.all(filePaths.map((fp) => this.readFile(fp)));
  }

  async applyOperation(operation: FileOperation): Promise<ApplyResult> {
    const absPath = this.assertSafePath(operation.filePath);

    try {
      switch (operation.type) {
        case "create": {
          const dir = path.dirname(absPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(absPath, operation.content ?? "", "utf-8");
          return { success: true, filePath: operation.filePath };
        }

        case "modify": {
          if (!fs.existsSync(absPath)) {
            return {
              success: false,
              filePath: operation.filePath,
              error: "File does not exist",
            };
          }

          const originalContent = fs.readFileSync(absPath, "utf-8");

          if (operation.diff) {
            // Apply diff
            const result = this.diffEngine.applyDiff(
              originalContent,
              operation.diff
            );
            if (!result.success) {
              return { ...result, filePath: operation.filePath };
            }
            // applyPatch returns the patched string; re-apply to get content
            const { applyPatch } = await import("diff");
            const patched = applyPatch(originalContent, operation.diff);
            if (patched === false) {
              return {
                success: false,
                filePath: operation.filePath,
                error: "Failed to apply diff",
              };
            }
            fs.writeFileSync(absPath, patched, "utf-8");
          } else if (operation.content !== undefined) {
            fs.writeFileSync(absPath, operation.content, "utf-8");
          }

          return {
            success: true,
            filePath: operation.filePath,
            backup: originalContent,
          };
        }

        case "delete": {
          if (!fs.existsSync(absPath)) {
            return {
              success: false,
              filePath: operation.filePath,
              error: "File does not exist",
            };
          }

          const backup = fs.readFileSync(absPath, "utf-8");
          fs.unlinkSync(absPath);
          return { success: true, filePath: operation.filePath, backup };
        }

        default:
          return {
            success: false,
            filePath: operation.filePath,
            error: `Unknown operation type: ${(operation as FileOperation).type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        filePath: operation.filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  generateDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): DiffResult {
    return this.diffEngine.generateDiff(filePath, oldContent, newContent);
  }

  detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];

    // Check special filenames
    const basename = path.basename(filePath).toLowerCase();
    if (basename === "dockerfile") return "dockerfile";
    if (basename === "makefile") return "makefile";
    if (basename === ".gitignore") return "gitignore";

    return "plaintext";
  }
}
