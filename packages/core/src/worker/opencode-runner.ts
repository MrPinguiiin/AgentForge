/**
 * OpenCode HTTP API Runner
 *
 * Uses the OpenCode Server HTTP API instead of spawning subprocesses.
 * This avoids the "Session not found" error that occurs when multiple
 * OpenCode instances try to access the same database.
 *
 * Architecture:
 * 1. TaskHive starts `opencode serve` on a dedicated port
 * 2. Runner creates sessions via POST /session
 * 3. Runner sends prompts via POST /session/:id/message
 * 4. Runner can abort via POST /session/:id/abort
 */

import { spawn, type ChildProcess } from "node:child_process";
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
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Environment variables to pass (unused in HTTP mode) */
  env?: Record<string, string>;
  /** Model to use, e.g. 9router/cx/gpt-5.5 */
  model?: string;
}

export interface OpenCodeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killed: boolean;
  /** OpenCode session ID (for debugging) */
  sessionId?: string;
}

export interface RunnerEvents {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  exit: (result: OpenCodeRunResult) => void;
}

// ── OpenCode Server Manager ──────────────────────

export interface OpenCodeServerConfig {
  /** Port for the OpenCode server (default: 4200) */
  port?: number;
  /** Hostname (default: 127.0.0.1) */
  hostname?: string;
  /** Path to opencode binary */
  binaryPath?: string;
  /** Working directory for the server */
  cwd?: string;
  /** Default model for attached runs */
  model?: string;
}

/**
 * Manages an `opencode serve` process.
 * Starts on demand, stops on cleanup.
 */
export class OpenCodeServer {
  private process: ChildProcess | null = null;
  private port: number;
  private hostname: string;
  private binaryPath: string;
  private cwd: string;
  private model?: string;
  private ready = false;
  private readyPromise: Promise<void> | null = null;

  constructor(config?: OpenCodeServerConfig) {
    this.port = config?.port ?? 4200;
    this.hostname = config?.hostname ?? "127.0.0.1";
    this.binaryPath = config?.binaryPath ?? "opencode";
    this.cwd = config?.cwd ?? process.cwd();
    this.model = config?.model;
  }

  get baseUrl(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  get binary(): string {
    return this.binaryPath;
  }

  get defaultModel(): string | undefined {
    return this.model;
  }

  get isRunning(): boolean {
    return this.ready;
  }

  /**
   * Start the OpenCode server.
   * Waits until the server is healthy before returning.
   */
  async start(): Promise<void> {
    if (this.ready && await this.healthCheck()) return;

    // Previous health state/promise may be stale after server exit or dev reload.
    this.ready = false;
    if (this.process?.killed) this.process = null;

    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = this._start().finally(() => {
      this.readyPromise = null;
    });
    return this.readyPromise;
  }

  private async _start(): Promise<void> {
    // First check if something is already listening on our port
    const alreadyRunning = await this.healthCheck();
    if (alreadyRunning) {
      log.info("OPENCODE-SERVER", `Server already running on ${this.baseUrl}`);
      this.ready = true;
      return;
    }

    log.info("OPENCODE-SERVER", `Starting opencode serve on port ${this.port}...`);

    this.process = spawn(
      this.binaryPath,
      ["serve", "--port", String(this.port), "--hostname", this.hostname],
      {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // Don't interfere with our own server
          TASKHIVE_OPENCODE_SERVER: "true",
          // Internal localhost server must be accessible by TaskHive without Basic Auth.
          OPENCODE_SERVER_PASSWORD: "",
          OPENCODE_SERVER_USERNAME: "",
        },
      },
    );

    // Log server output
    this.process.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log.info("OPENCODE-SERVER", `stdout: ${msg}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log.warn("OPENCODE-SERVER", `stderr: ${msg}`);
    });

    this.process.on("error", (err) => {
      log.error("OPENCODE-SERVER", `Process error: ${err.message}`);
      this.ready = false;
    });

    this.process.on("close", (code) => {
      log.info("OPENCODE-SERVER", `Process exited with code ${code}`);
      this.ready = false;
      this.process = null;
    });

    // Wait for server to become healthy (poll every 500ms, max 30s)
    const maxWait = 30_000;
    const pollInterval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));

      if (this.process?.killed) {
        throw new Error("OpenCode server process died during startup");
      }

      const healthy = await this.healthCheck();
      if (healthy) {
        this.ready = true;
        log.info("OPENCODE-SERVER", `Server ready on ${this.baseUrl} (took ${Date.now() - startTime}ms)`);
        return;
      }
    }

    // Timeout - kill and throw
    this.stop();
    throw new Error(`OpenCode server failed to start within ${maxWait}ms`);
  }

  /**
   * Check if the server is healthy
   */
  private async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/global/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = (await res.json()) as { healthy?: boolean };
        return data.healthy === true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Stop the OpenCode server
   */
  stop(): void {
    if (this.process && !this.process.killed) {
      log.info("OPENCODE-SERVER", "Stopping server...");
      this.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    this.ready = false;
    this.process = null;
    this.readyPromise = null;
  }
}

// ── OpenCode Runner (HTTP API) ──────────────────────

/**
 * Runs prompts against the OpenCode HTTP API.
 * Creates a session, sends a message, and captures the response.
 */
export class OpenCodeRunner extends EventEmitter<RunnerEvents> {
  private server: OpenCodeServer;
  private process: ChildProcess | null = null;
  private activeSessionId: string | null = null;
  private aborted = false;

  constructor(server: OpenCodeServer) {
    super();
    this.server = server;
  }

  /**
   * Run a prompt against OpenCode via `opencode run --attach`.
   * Direct POST /session/:id/message can hang on OpenCode 1.14.40, while the
   * CLI attach path uses the same server API but handles event streaming correctly.
   */
  async run(options: OpenCodeRunOptions): Promise<OpenCodeRunResult> {
    const { cwd, agent, prompt, timeout = 5 * 60 * 1000, model } = options;

    const startTime = Date.now();
    this.aborted = false;

    try {
      // Ensure server is running
      if (!this.server.isRunning) {
        await this.server.start();
      }

      return await this.runAttachedCli({ cwd, agent, prompt, timeout, startTime, model });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      log.error("RUNNER", `Error: ${errorMsg}`);

      const result: OpenCodeRunResult = {
        exitCode: 1,
        stdout: "",
        stderr: errorMsg,
        durationMs,
        timedOut: false,
        killed: this.aborted,
      };

      this.activeSessionId = null;
      this.emit("exit", result);
      return result;
    }
  }

  private async runAttachedCli(options: {
    cwd: string;
    agent: string;
    prompt: string;
    timeout: number;
    startTime: number;
    model?: string;
  }): Promise<OpenCodeRunResult> {
    const { cwd, agent, prompt, timeout, startTime } = options;

    return new Promise<OpenCodeRunResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const args = [
        "run",
        "--attach",
        this.server.baseUrl,
        "--dir",
        cwd,
        "--agent",
        agent,
        "--dangerously-skip-permissions",
      ];

      const model = options.model ?? this.server.defaultModel;
      if (model) args.push("--model", model);

      args.push(prompt);

      log.info("RUNNER", `Spawning opencode ${args.slice(0, 7).join(" ")} <prompt:${prompt.length}>`);

      this.process = spawn(this.server.binary, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          TASKHIVE_RUN: "true",
          CI: "true",
          TERM: "dumb",
        },
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        this.kill();
      }, timeout);

      this.process.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        this.emit("stdout", chunk);
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        this.emit("stderr", chunk);
      });

      this.process.on("close", (exitCode) => {
        clearTimeout(timeoutId);
        const result: OpenCodeRunResult = {
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut,
          killed: this.aborted,
        };
        this.process = null;
        this.emit("exit", result);
        resolve(result);
      });

      this.process.on("error", (err) => {
        clearTimeout(timeoutId);
        const result: OpenCodeRunResult = {
          exitCode: 1,
          stdout,
          stderr: `${stderr}\nProcess error: ${err.message}`,
          durationMs: Date.now() - startTime,
          timedOut,
          killed: true,
        };
        this.process = null;
        this.emit("exit", result);
        resolve(result);
      });
    });
  }

  /**
   * Abort the current session
   */
  async abort(): Promise<void> {
    this.aborted = true;
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    if (this.activeSessionId && this.server.isRunning) {
      try {
        await fetch(`${this.server.baseUrl}/session/${this.activeSessionId}/abort`, {
          method: "POST",
          signal: AbortSignal.timeout(5000),
        });
        log.info("RUNNER", `Aborted session ${this.activeSessionId}`);
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Kill = abort (backward compat)
   */
  kill(): void {
    this.abort();
  }

  /**
   * Check if a request is currently running
   */
  get isRunning(): boolean {
    return this.activeSessionId !== null || (this.process !== null && !this.process.killed);
  }
}

// ── Planning JSON Parser ──────────────────────

/**
 * Parse planning JSON from OpenCode output.
 * OpenCode output may contain extra text around the JSON.
 * Per docs section 23.
 */
export function parsePlanningJson(stdout: string): Record<string, unknown> {
  // First try: direct JSON parse
  try {
    return JSON.parse(stdout.trim());
  } catch {
    // Fallback: find JSON object in output
  }

  // Try to find a JSON block (possibly wrapped in markdown code fences)
  const codeBlockMatch = stdout.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue to next strategy
    }
  }

  // Try to find the outermost JSON object
  const jsonMatch = stdout.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in OpenCode output");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from OpenCode output: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
