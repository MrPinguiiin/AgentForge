/**
 * TaskHive Worker Logger
 *
 * Colored console output for worker pipeline progress.
 */

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export const log = {
  // ── Queue ──────────────────────
  jobQueued(type: string, taskId: string, jobId: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.cyan}[QUEUE]${COLORS.reset} ${COLORS.bold}${type.toUpperCase()}${COLORS.reset} job queued ${COLORS.dim}task=${shortId(taskId)} job=${shortId(jobId)}${COLORS.reset}`
    );
  },

  jobStarted(type: string, taskId: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[QUEUE]${COLORS.reset} ${COLORS.bold}${type.toUpperCase()}${COLORS.reset} job started ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  jobCompleted(type: string, taskId: string, durationMs?: number) {
    const dur = durationMs ? ` ${COLORS.dim}(${(durationMs / 1000).toFixed(1)}s)${COLORS.reset}` : "";
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.green}[QUEUE]${COLORS.reset} ${COLORS.bold}${type.toUpperCase()}${COLORS.reset} job completed${dur} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  jobFailed(type: string, taskId: string, error: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.red}[QUEUE]${COLORS.reset} ${COLORS.bold}${type.toUpperCase()}${COLORS.reset} job failed ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n  ${COLORS.red}Error: ${error}${COLORS.reset}`
    );
  },

  // ── Planning ──────────────────────
  planningStart(taskId: string, projectPath: string) {
    console.log(
      `\n${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} ${COLORS.bold}Starting planning${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n` +
      `  ${COLORS.dim}Project: ${projectPath}${COLORS.reset}`
    );
  },

  planningPromptBuilt(taskId: string, promptLength: number) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} Prompt built ${COLORS.dim}(${promptLength} chars) task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  planningOpenCodeSpawned(taskId: string, agent: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} Spawning OpenCode ${COLORS.cyan}--agent ${agent}${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  planningOpenCodeOutput(taskId: string, stdoutLen: number, stderrLen: number, exitCode: number, durationMs: number) {
    const status = exitCode === 0 ? `${COLORS.green}exit=0${COLORS.reset}` : `${COLORS.red}exit=${exitCode}${COLORS.reset}`;
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} OpenCode finished ${status} ${COLORS.dim}stdout=${stdoutLen}b stderr=${stderrLen}b ${(durationMs / 1000).toFixed(1)}s task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  planningJsonParsed(taskId: string, summary: string, riskLevel: string, agent: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} ${COLORS.green}Plan parsed successfully${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n` +
      `  ${COLORS.dim}Summary: ${summary.slice(0, 80)}${summary.length > 80 ? "..." : ""}${COLORS.reset}\n` +
      `  ${COLORS.dim}Risk: ${riskLevel} | Agent: ${agent}${COLORS.reset}`
    );
  },

  planningJsonFailed(taskId: string, error: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} ${COLORS.red}Failed to parse plan JSON${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n` +
      `  ${COLORS.red}${error}${COLORS.reset}`
    );
  },

  planningNeedsHuman(taskId: string, reason: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} ${COLORS.yellow}Needs human intervention${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n` +
      `  ${COLORS.yellow}Reason: ${reason}${COLORS.reset}`
    );
  },

  planningComplete(taskId: string, nextStatus: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[PLANNING]${COLORS.reset} ${COLORS.green}Complete${COLORS.reset} -> ${COLORS.bold}${nextStatus}${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n`
    );
  },

  // ── Execution ──────────────────────
  executionStart(taskId: string, agentName: string, branchName: string) {
    console.log(
      `\n${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[EXECUTION]${COLORS.reset} ${COLORS.bold}Starting execution${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n` +
      `  ${COLORS.dim}Agent: ${agentName}${COLORS.reset}\n` +
      `  ${COLORS.dim}Branch: ${branchName}${COLORS.reset}`
    );
  },

  executionBranchCreated(taskId: string, branchName: string, created: boolean) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[EXECUTION]${COLORS.reset} Branch ${created ? "created" : "checked out"}: ${COLORS.cyan}${branchName}${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  executionOpenCodeSpawned(taskId: string, agent: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[EXECUTION]${COLORS.reset} Spawning OpenCode ${COLORS.cyan}--agent ${agent}${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  executionOpenCodeOutput(taskId: string, exitCode: number, durationMs: number) {
    const status = exitCode === 0 ? `${COLORS.green}exit=0${COLORS.reset}` : `${COLORS.red}exit=${exitCode}${COLORS.reset}`;
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[EXECUTION]${COLORS.reset} OpenCode finished ${status} ${COLORS.dim}${(durationMs / 1000).toFixed(1)}s task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  executionResultsCollected(taskId: string, diffLines: number, artifactCount: number) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[EXECUTION]${COLORS.reset} Results collected ${COLORS.dim}diff=${diffLines} lines, ${artifactCount} artifacts task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  executionComplete(taskId: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[EXECUTION]${COLORS.reset} ${COLORS.green}Complete${COLORS.reset} -> ${COLORS.bold}in_review${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n`
    );
  },

  // ── Review ──────────────────────
  reviewStart(taskId: string) {
    console.log(
      `\n${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.yellow}[REVIEW]${COLORS.reset} ${COLORS.bold}Starting AI review${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  reviewComplete(taskId: string, verdictLength: number) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.yellow}[REVIEW]${COLORS.reset} ${COLORS.green}Review complete${COLORS.reset} ${COLORS.dim}(${verdictLength} chars) task=${shortId(taskId)}${COLORS.reset}\n`
    );
  },

  // ── QA ──────────────────────
  qaStart(taskId: string) {
    console.log(
      `\n${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.green}[QA]${COLORS.reset} ${COLORS.bold}Starting QA verification${COLORS.reset} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}`
    );
  },

  qaComplete(taskId: string, passed: boolean) {
    const result = passed ? `${COLORS.green}PASSED${COLORS.reset}` : `${COLORS.red}FAILED${COLORS.reset}`;
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.green}[QA]${COLORS.reset} QA ${result} ${COLORS.dim}task=${shortId(taskId)}${COLORS.reset}\n`
    );
  },

  // ── Task State ──────────────────────
  taskStatusChanged(taskId: string, from: string, to: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.white}[TASK]${COLORS.reset} ${shortId(taskId)} ${COLORS.dim}${from}${COLORS.reset} -> ${COLORS.bold}${to}${COLORS.reset}`
    );
  },

  // ── General ──────────────────────
  error(context: string, error: string) {
    console.error(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.bgRed}${COLORS.white} ERROR ${COLORS.reset} ${COLORS.red}[${context}]${COLORS.reset} ${error}`
    );
  },

  info(context: string, message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.cyan}[${context}]${COLORS.reset} ${message}`
    );
  },

  warn(context: string, message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.yellow}[${context}]${COLORS.reset} ${message}`
    );
  },
};
