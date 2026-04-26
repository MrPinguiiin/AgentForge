export interface ContextConfig {
  maxFiles: number;
  maxFileSize: number;
  includePatterns: string[];
  excludePatterns: string[];
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  type: "frontend" | "backend" | "fullstack" | "library" | "tool";
  language: string;
  features: string[];
}

export interface RelevanceScore {
  filePath: string;
  score: number;
  reasons: string[];
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxFiles: 20,
  maxFileSize: 100_000, // 100KB
  includePatterns: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
    "**/*.py",
    "**/*.rs",
    "**/*.go",
    "**/*.java",
    "**/*.vue",
    "**/*.svelte",
  ],
  excludePatterns: [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".git/**",
    "coverage/**",
    "*.min.js",
    "*.map",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
  ],
};
