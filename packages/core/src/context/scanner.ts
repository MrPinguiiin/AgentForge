import * as fs from "node:fs";
import * as path from "node:path";
import type { FrameworkInfo } from "./types.js";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const FRAMEWORK_DETECTORS: Array<{
  name: string;
  type: FrameworkInfo["type"];
  language: string;
  detect: (pkg: PackageJson) => { detected: boolean; version?: string; features: string[] };
}> = [
  {
    name: "Next.js",
    type: "fullstack",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["next"] ?? pkg.devDependencies?.["next"];
      const features: string[] = [];
      if (pkg.dependencies?.["@next/font"]) features.push("custom-fonts");
      if (pkg.dependencies?.["next-auth"]) features.push("auth");
      return { detected: !!version, version, features };
    },
  },
  {
    name: "React",
    type: "frontend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["react"] ?? pkg.devDependencies?.["react"];
      const features: string[] = [];
      if (pkg.dependencies?.["react-router-dom"]) features.push("routing");
      if (pkg.dependencies?.["@tanstack/react-query"]) features.push("data-fetching");
      if (pkg.dependencies?.["zustand"] || pkg.dependencies?.["@reduxjs/toolkit"]) features.push("state-management");
      return { detected: !!version, version, features };
    },
  },
  {
    name: "Vue",
    type: "frontend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["vue"] ?? pkg.devDependencies?.["vue"];
      const features: string[] = [];
      if (pkg.dependencies?.["vue-router"]) features.push("routing");
      if (pkg.dependencies?.["pinia"]) features.push("state-management");
      return { detected: !!version, version, features };
    },
  },
  {
    name: "Svelte",
    type: "frontend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["svelte"] ?? pkg.devDependencies?.["svelte"];
      const features: string[] = [];
      if (pkg.dependencies?.["@sveltejs/kit"] || pkg.devDependencies?.["@sveltejs/kit"]) {
        features.push("sveltekit");
      }
      return { detected: !!version, version, features };
    },
  },
  {
    name: "Express",
    type: "backend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["express"];
      return { detected: !!version, version, features: [] };
    },
  },
  {
    name: "Hono",
    type: "backend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["hono"];
      return { detected: !!version, version, features: [] };
    },
  },
  {
    name: "Fastify",
    type: "backend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["fastify"];
      return { detected: !!version, version, features: [] };
    },
  },
  {
    name: "NestJS",
    type: "backend",
    language: "typescript",
    detect: (pkg) => {
      const version = pkg.dependencies?.["@nestjs/core"];
      return { detected: !!version, version, features: [] };
    },
  },
];

export class ProjectScanner {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async detectFramework(): Promise<FrameworkInfo | null> {
    const pkgPath = path.join(this.rootPath, "package.json");

    if (!fs.existsSync(pkgPath)) {
      return null;
    }

    let pkg: PackageJson;
    try {
      const content = fs.readFileSync(pkgPath, "utf-8");
      pkg = JSON.parse(content);
    } catch {
      return null;
    }

    for (const detector of FRAMEWORK_DETECTORS) {
      const result = detector.detect(pkg);
      if (result.detected) {
        return {
          name: detector.name,
          version: result.version,
          type: detector.type,
          language: detector.language,
          features: result.features,
        };
      }
    }

    // Check for TypeScript
    if (pkg.devDependencies?.["typescript"] || pkg.dependencies?.["typescript"]) {
      return {
        name: "TypeScript",
        type: "library",
        language: "typescript",
        features: [],
      };
    }

    return null;
  }

  async detectLanguage(): Promise<string> {
    const framework = await this.detectFramework();
    if (framework) return framework.language;

    // Check for common config files
    const checks: Array<{ file: string; language: string }> = [
      { file: "tsconfig.json", language: "typescript" },
      { file: "pyproject.toml", language: "python" },
      { file: "Cargo.toml", language: "rust" },
      { file: "go.mod", language: "go" },
      { file: "pom.xml", language: "java" },
      { file: "build.gradle", language: "java" },
      { file: "Gemfile", language: "ruby" },
      { file: "composer.json", language: "php" },
    ];

    for (const check of checks) {
      if (fs.existsSync(path.join(this.rootPath, check.file))) {
        return check.language;
      }
    }

    return "unknown";
  }
}
