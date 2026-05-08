/**
 * Project Scanner
 *
 * Scans a project directory to build context for AI agents.
 * Provides file tree, key file contents, and framework detection
 * so agents understand the existing project structure before
 * planning or executing tasks.
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, basename, extname, relative } from "node:path";
import { log } from "./logger.js";

// ── Types ──────────────────────

export interface ProjectContext {
  /** Formatted file tree string */
  fileTree: string;
  /** List of key file paths (relative) */
  keyFiles: string[];
  /** Truncated contents of key files */
  keyFileContents: string;
  /** Detected framework/stack */
  framework: string;
  /** Total file count */
  fileCount: number;
  /** Full formatted context block ready for prompt injection */
  summary: string;
}

interface FileEntry {
  /** Relative path from project root */
  path: string;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDir: boolean;
}

// ── Constants ──────────────────────

/** Directories to always skip */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".env",
  ".cache",
  ".turbo",
  ".parcel-cache",
  "coverage",
  ".nyc_output",
  ".idea",
  ".vscode",
  "vendor",
  "target",
  ".gradle",
  ".dart_tool",
  ".pub-cache",
]);

/** Files that are considered "key" for understanding project structure */
const KEY_FILE_PATTERNS = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.ts",
  "nuxt.config.ts",
  "svelte.config.js",
  "svelte.config.ts",
  "webpack.config.js",
  "rollup.config.js",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "index.html",
  "app.html",
  "README.md",
  "Cargo.toml",
  "go.mod",
  "requirements.txt",
  "pyproject.toml",
  "Gemfile",
  "composer.json",
  "pubspec.yaml",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env.example",
];

/** Max chars to read from each key file */
const KEY_FILE_MAX_CHARS = 600;

/** Max depth for directory traversal */
const MAX_DEPTH = 4;

/** Max total files to list in tree */
const MAX_TREE_FILES = 60;

// ── Scanner ──────────────────────

export class ProjectScanner {
  /**
   * Scan a project directory and return structured context.
   */
  static async scan(projectPath: string): Promise<ProjectContext> {
    const startTime = Date.now();

    try {
      // 1. Walk directory tree
      const entries = await this.walkDir(projectPath, projectPath, 0);
      const files = entries.filter((e) => !e.isDir);
      const dirs = entries.filter((e) => e.isDir);

      // 2. Build file tree string
      const fileTree = this.buildFileTree(entries, projectPath);

      // 3. Find key files
      const keyFiles = this.findKeyFiles(files);

      // 4. Read key file contents
      const keyFileContents = await this.readKeyFiles(projectPath, keyFiles);

      // 5. Detect framework
      const framework = await this.detectFramework(projectPath, keyFiles, files);

      // 6. Build summary
      const summary = this.buildSummary(
        projectPath,
        fileTree,
        keyFileContents,
        framework,
        files.length,
        dirs.length,
      );

      const elapsed = Date.now() - startTime;
      log.info(
        "SCANNER",
        `Scanned ${projectPath}: ${files.length} files, ${dirs.length} dirs, framework=${framework} (${elapsed}ms)`,
      );

      return {
        fileTree,
        keyFiles,
        keyFileContents,
        framework,
        fileCount: files.length,
        summary,
      };
    } catch (err) {
      log.warn(
        "SCANNER",
        `Failed to scan ${projectPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        fileTree: "(scan failed)",
        keyFiles: [],
        keyFileContents: "",
        framework: "unknown",
        fileCount: 0,
        summary: `PROJECT CONTEXT:\nDirectory: ${projectPath}\n(project scan failed — directory may be empty or inaccessible)\n`,
      };
    }
  }

  /**
   * Recursively walk a directory, respecting depth limits and skip patterns.
   */
  private static async walkDir(
    rootPath: string,
    currentPath: string,
    depth: number,
  ): Promise<FileEntry[]> {
    if (depth > MAX_DEPTH) return [];

    const entries: FileEntry[] = [];
    let dirEntries: string[];

    try {
      const items = await readdir(currentPath, { withFileTypes: true });
      dirEntries = items
        .map((d) => d.name)
        .filter((name) => !name.startsWith(".") || KEY_FILE_PATTERNS.includes(name))
        .sort();
    } catch {
      return [];
    }

    let fileCount = 0;

    for (const name of dirEntries) {
      if (entries.length >= MAX_TREE_FILES) break;

      const fullPath = join(currentPath, name);
      const relPath = relative(rootPath, fullPath);

      try {
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          if (SKIP_DIRS.has(name)) continue;

          entries.push({ path: relPath, size: 0, isDir: true });

          // Recurse into subdirectory
          const subEntries = await this.walkDir(rootPath, fullPath, depth + 1);
          entries.push(...subEntries);
        } else {
          fileCount++;
          entries.push({ path: relPath, size: stats.size, isDir: false });
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    return entries;
  }

  /**
   * Build a tree-like string representation of the file structure.
   */
  private static buildFileTree(entries: FileEntry[], _rootPath: string): string {
    if (entries.length === 0) return "(empty project)";

    const lines: string[] = [];

    for (const entry of entries) {
      const depth = entry.path.split("/").length - 1;
      const indent = "  ".repeat(depth);
      const name = basename(entry.path);

      if (entry.isDir) {
        lines.push(`${indent}${name}/`);
      } else {
        const sizeStr = this.formatSize(entry.size);
        lines.push(`${indent}${name} (${sizeStr})`);
      }
    }

    if (entries.length >= MAX_TREE_FILES) {
      lines.push(`  ... (truncated, showing first ${MAX_TREE_FILES} entries)`);
    }

    return lines.join("\n");
  }

  /**
   * Find key files from the file list.
   */
  private static findKeyFiles(files: FileEntry[]): string[] {
    const keyFiles: string[] = [];

    for (const file of files) {
      const name = basename(file.path);
      if (KEY_FILE_PATTERNS.includes(name)) {
        keyFiles.push(file.path);
      }
    }

    // Also include entry point files at root level
    const entryPatterns = [
      "index.ts",
      "index.js",
      "main.ts",
      "main.js",
      "app.ts",
      "app.js",
      "App.tsx",
      "App.jsx",
      "App.svelte",
      "App.vue",
      "main.py",
      "app.py",
      "main.go",
      "main.rs",
    ];

    for (const file of files) {
      const name = basename(file.path);
      // Only include root-level or src-level entry points
      const depth = file.path.split("/").length;
      if (depth <= 2 && entryPatterns.includes(name) && !keyFiles.includes(file.path)) {
        keyFiles.push(file.path);
      }
    }

    return keyFiles;
  }

  /**
   * Read and truncate key file contents.
   */
  private static async readKeyFiles(
    projectPath: string,
    keyFiles: string[],
  ): Promise<string> {
    if (keyFiles.length === 0) return "(no key files found)";

    const sections: string[] = [];

    for (const relPath of keyFiles) {
      try {
        const fullPath = join(projectPath, relPath);
        const content = await readFile(fullPath, "utf-8");
        const truncated =
          content.length > KEY_FILE_MAX_CHARS
            ? content.slice(0, KEY_FILE_MAX_CHARS) + "\n... (truncated)"
            : content;

        sections.push(`--- ${relPath} ---\n${truncated.trim()}`);
      } catch {
        // Skip unreadable files
      }
    }

    return sections.join("\n\n");
  }

  /**
   * Detect the project framework/stack from key files and patterns.
   */
  private static async detectFramework(
    projectPath: string,
    keyFiles: string[],
    allFiles: FileEntry[],
  ): Promise<string> {
    // Check package.json for dependencies
    if (keyFiles.includes("package.json")) {
      try {
        const pkgContent = await readFile(join(projectPath, "package.json"), "utf-8");
        const pkg = JSON.parse(pkgContent);
        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };

        if (allDeps["next"]) return "Next.js";
        if (allDeps["nuxt"]) return "Nuxt";
        if (allDeps["@sveltejs/kit"]) return "SvelteKit";
        if (allDeps["svelte"]) return "Svelte";
        if (allDeps["vue"]) return "Vue";
        if (allDeps["react"]) return "React";
        if (allDeps["angular"]) return "Angular";
        if (allDeps["express"]) return "Express.js";
        if (allDeps["hono"]) return "Hono";
        if (allDeps["fastify"]) return "Fastify";
        if (allDeps["nest"]) return "NestJS";
        if (allDeps["electron"]) return "Electron";
        if (allDeps["react-native"]) return "React Native";
        if (allDeps["typescript"]) return "TypeScript (Node.js)";
        return "Node.js";
      } catch {
        // Fall through
      }
    }

    // Check for other project types
    if (keyFiles.includes("Cargo.toml")) return "Rust";
    if (keyFiles.includes("go.mod")) return "Go";
    if (keyFiles.includes("pyproject.toml") || keyFiles.includes("requirements.txt"))
      return "Python";
    if (keyFiles.includes("Gemfile")) return "Ruby";
    if (keyFiles.includes("composer.json")) return "PHP";
    if (keyFiles.includes("pubspec.yaml")) return "Flutter/Dart";

    // Check file extensions
    const extensions = allFiles.map((f) => extname(f.path).toLowerCase());
    if (extensions.includes(".tsx") || extensions.includes(".jsx")) return "React";
    if (extensions.includes(".svelte")) return "Svelte";
    if (extensions.includes(".vue")) return "Vue";
    if (extensions.includes(".ts")) return "TypeScript";
    if (extensions.includes(".py")) return "Python";
    if (extensions.includes(".go")) return "Go";
    if (extensions.includes(".rs")) return "Rust";
    if (extensions.includes(".rb")) return "Ruby";
    if (extensions.includes(".php")) return "PHP";
    if (extensions.includes(".java")) return "Java";
    if (extensions.includes(".cs")) return "C#";
    if (extensions.includes(".swift")) return "Swift";
    if (extensions.includes(".kt")) return "Kotlin";

    // Check for plain HTML/CSS/JS
    if (extensions.includes(".html")) {
      if (extensions.includes(".js") || extensions.includes(".css")) {
        return "Vanilla HTML/CSS/JS";
      }
      return "HTML";
    }

    if (extensions.includes(".js")) return "JavaScript";

    return "unknown";
  }

  /**
   * Build the full formatted context summary for prompt injection.
   */
  private static buildSummary(
    projectPath: string,
    fileTree: string,
    keyFileContents: string,
    framework: string,
    fileCount: number,
    dirCount: number,
  ): string {
    const isEmpty = fileCount === 0;

    if (isEmpty) {
      return [
        "PROJECT CONTEXT:",
        `Directory: ${projectPath}`,
        `Framework: ${framework}`,
        "",
        "This is an EMPTY project directory. No existing files.",
        "You are starting from scratch — create all necessary files.",
      ].join("\n");
    }

    return [
      "PROJECT CONTEXT:",
      `Directory: ${projectPath}`,
      `Framework: ${framework}`,
      `Structure: ${fileCount} files in ${dirCount} directories`,
      "",
      "File Tree:",
      fileTree,
      "",
      "Key Files:",
      keyFileContents,
      "",
      "IMPORTANT: Your code MUST integrate with the existing files above.",
      "Do NOT recreate files that already exist unless the task specifically asks to modify them.",
      "If existing files reference other files (e.g., <script src=\"script.js\">), create those referenced files to be compatible.",
    ].join("\n");
  }

  /**
   * Format file size in human-readable form.
   */
  private static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}
