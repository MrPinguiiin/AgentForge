/**
 * OpenCode Runner — SDK-based
 *
 * Uses @opencode-ai/sdk to create per-project OpenCode instances
 * and send prompts via the session API.
 *
 * This replaces the CLI subprocess approach which had issues with:
 * - "Session not found" errors
 * - Wrong project context (worktree scoping)
 * - Stuck processes
 */

import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import { execSync } from "node:child_process";
import EventEmitter from "eventemitter3";
import { log } from "./logger.js";

// ── Types ──────────────────────

export interface OpenCodeRunOptions {
  /** Working directory (project root) */
  cwd: string;
  /** Agent name: plan, build, frontend, backend, qa, review, etc. */
  agent: string;
  /** The prompt to send */
  prompt: string;
  /** Timeout in milliseconds (default: 15 minutes) */
  timeout?: number;
  /** Environment variables (unused in SDK mode) */
  env?: Record<string, string>;
  /** Model in OpenCode format: provider/model (e.g. "9router/cx/gpt-5.5") */
  model?: string;
}

export interface OpenCodeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killed: boolean;
}

export interface RunnerEvents {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  exit: (result: OpenCodeRunResult) => void;
}

// ── Server config ──────────────────────

export interface OpenCodeServerConfig {
  /** Base port for per-project servers */
  basePort?: number;
  /** Hostname (default: 127.0.0.1) */
  hostname?: string;
  /** Path to opencode binary (unused in SDK mode) */
  binaryPath?: string;
  /** Default model (OpenCode format: provider/model) */
  model?: string;
}

// ── Per-project SDK instance pool ──────────────────────

interface ManagedInstance {
  client: ReturnType<typeof createOpencodeClient>;
  close: () => void;
  port: number;
  projectPath: string;
}

export class OpenCodeServerPool {
  private instances = new Map<string, ManagedInstance>();
  private startPromises = new Map<string, Promise<ManagedInstance>>();
  private nextPort: number;
  private hostname: string;
  private _model?: string;

  constructor(config?: OpenCodeServerConfig) {
    this.nextPort = config?.basePort ?? 4200;
    this.hostname = config?.hostname ?? "127.0.0.1";
    this._model = config?.model;
  }

  get defaultModel(): string | undefined {
    return this._model;
  }

  /**
   * Get or create an OpenCode SDK client for the given project path.
   */
  async getClient(projectPath: string): Promise<ReturnType<typeof createOpencodeClient>> {
    // Already running?
    const existing = this.instances.get(projectPath);
    if (existing) {
      try {
        const res = await fetch(`http://${this.hostname}:${existing.port}/global/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return existing.client;
      } catch { /* stale, restart */ }
      this.stopInstance(projectPath);
    }

    // Already starting?
    const pending = this.startPromises.get(projectPath);
    if (pending) {
      const inst = await pending;
      return inst.client;
    }

    const promise = this.startInstance(projectPath);
    this.startPromises.set(projectPath, promise);
    try {
      const inst = await promise;
      return inst.client;
    } finally {
      this.startPromises.delete(projectPath);
    }
  }

  private ensureGitRepo(projectPath: string): void {
    try {
      execSync("git rev-parse --is-inside-work-tree", { cwd: projectPath, stdio: "pipe" });
    } catch {
      log.info("OPENCODE-SERVER", `Initializing git in ${projectPath} (required by OpenCode for project scoping)`);
      execSync("git init", { cwd: projectPath, stdio: "pipe" });
    }
  }

  private async startInstance(projectPath: string): Promise<ManagedInstance> {
    this.ensureGitRepo(projectPath);

    const port = this.nextPort++;
    log.info("OPENCODE-SERVER", `Starting OpenCode SDK instance on port ${port} for ${projectPath}`);

    // Change to project directory so OpenCode scopes to it
    const originalCwd = process.cwd();
    try {
      process.chdir(projectPath);

      const opencode = await createOpencode({
        hostname: this.hostname,
        port,
        timeout: 30_000,
      });

      const inst: ManagedInstance = {
        client: opencode.client,
        close: () => opencode.server.close(),
        port,
        projectPath,
      };

      this.instances.set(projectPath, inst);
      log.info("OPENCODE-SERVER", `[${port}] Ready for ${projectPath}`);
      return inst;
    } finally {
      process.chdir(originalCwd);
    }
  }

  private stopInstance(projectPath: string): void {
    const inst = this.instances.get(projectPath);
    if (inst) {
      try { inst.close(); } catch { /* best effort */ }
      this.instances.delete(projectPath);
    }
  }

  stopAll(): void {
    for (const [path] of this.instances) {
      this.stopInstance(path);
    }
  }
}

// ── Backward-compat wrapper ──────────────────────

export class OpenCodeServer {
  private pool: OpenCodeServerPool;

  constructor(config?: OpenCodeServerConfig) {
    this.pool = new OpenCodeServerPool(config);
  }

  get defaultModel(): string | undefined { return this.pool.defaultModel; }
  get isRunning(): boolean { return true; }
  get baseUrl(): string { return ""; }
  get binary(): string { return "opencode"; }

  async start(): Promise<void> { /* pool starts on demand */ }
  stop(): void { this.pool.stopAll(); }
  getPool(): OpenCodeServerPool { return this.pool; }
}

// ── OpenCode Runner (SDK-based) ──────────────────────

export class OpenCodeRunner extends EventEmitter<RunnerEvents> {
  private pool: OpenCodeServerPool;
  private aborted = false;
  private activeAbort: (() => Promise<void>) | null = null;

  constructor(server: OpenCodeServer) {
    super();
    this.pool = server.getPool();
  }

  async run(options: OpenCodeRunOptions): Promise<OpenCodeRunResult> {
    const { cwd, agent, prompt, timeout = 15 * 60 * 1000, model } = options;
    const startTime = Date.now();
    this.aborted = false;

    try {
      const client = await this.pool.getClient(cwd);

      // 1. Create session
      log.info("RUNNER", `Creating session for agent=${agent} in ${cwd}`);
      const sessionRes = await client.session.create({
        body: { title: `TaskHive: ${agent}` },
      });

      const sessionId = sessionRes.data?.id;
      if (!sessionId) {
        throw new Error(`Failed to create session: ${JSON.stringify(sessionRes.error)}`);
      }

      log.info("RUNNER", `Session ${sessionId} created, sending prompt (${prompt.length} chars)`);

      // Set up abort handler
      this.activeAbort = async () => {
        try {
          await client.session.abort({ path: { id: sessionId } });
          log.info("RUNNER", `Aborted session ${sessionId}`);
        } catch { /* best effort */ }
      };

      // 2. Send prompt with timeout
      const resolvedModel = model ?? this.pool.defaultModel;
      const modelConfig = resolvedModel ? this.parseModel(resolvedModel) : undefined;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        log.warn("RUNNER", `Timeout after ${timeout}ms, aborting session ${sessionId}`);
        controller.abort();
        this.abort();
      }, timeout);

      try {
        const result = await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: prompt }],
            agent,
            ...(modelConfig ? { model: modelConfig } : {}),
          },
        });

        clearTimeout(timeoutId);
        this.activeAbort = null;

        // Extract text from response parts
        const parts = result.data?.parts ?? [];
        const textContent = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.content ?? p.text ?? "")
          .filter(Boolean)
          .join("\n");

        const durationMs = Date.now() - startTime;
        log.info("RUNNER", `Session ${sessionId} completed (${durationMs}ms, ${textContent.length} chars)`);

        this.emit("stdout", textContent);

        const runResult: OpenCodeRunResult = {
          exitCode: 0,
          stdout: textContent,
          stderr: "",
          durationMs,
          timedOut: false,
          killed: this.aborted,
        };
        this.emit("exit", runResult);
        return runResult;

      } catch (err) {
        clearTimeout(timeoutId);
        this.activeAbort = null;

        if (this.aborted || (err instanceof Error && err.name === "AbortError")) {
          const durationMs = Date.now() - startTime;
          const runResult: OpenCodeRunResult = {
            exitCode: 1,
            stdout: "",
            stderr: "Aborted (timeout or manual)",
            durationMs,
            timedOut: !this.aborted,
            killed: this.aborted,
          };
          this.emit("exit", runResult);
          return runResult;
        }
        throw err;
      }

    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("RUNNER", `Error: ${errorMsg}`);

      const runResult: OpenCodeRunResult = {
        exitCode: 1,
        stdout: "",
        stderr: errorMsg,
        durationMs,
        timedOut: false,
        killed: this.aborted,
      };
      this.emit("exit", runResult);
      return runResult;
    }
  }

  private parseModel(model: string): { providerID: string; modelID: string } | undefined {
    // Format: "provider/model" e.g. "9router/cx/gpt-5.5"
    const slashIdx = model.indexOf("/");
    if (slashIdx === -1) return undefined;
    return {
      providerID: model.slice(0, slashIdx),
      modelID: model.slice(slashIdx + 1),
    };
  }

  async abort(): Promise<void> {
    this.aborted = true;
    if (this.activeAbort) {
      await this.activeAbort();
      this.activeAbort = null;
    }
  }

  kill(): void { this.abort(); }

  get isRunning(): boolean {
    return this.activeAbort !== null;
  }
}

// ── Planning JSON Parser ──────────────────────

export function parsePlanningJson(stdout: string): Record<string, unknown> {
  try { return JSON.parse(stdout.trim()); } catch { /* fallback */ }

  const codeBlockMatch = stdout.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* next */ }
  }

  const jsonMatch = stdout.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object found in OpenCode output");

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}
