/**
 * Branch Manager
 *
 * Creates and manages isolated branches per task.
 * Per docs section 18: taskhive/{task-id}-{slug}
 */

import { spawn } from "node:child_process";

export interface BranchInfo {
  name: string;
  created: boolean;
  baseBranch: string;
  isGitRepo: boolean;
  hasRemote: boolean;
}

export class BranchManager {
  /**
   * Check whether cwd is inside a git work tree.
   */
  static async isGitRepository(cwd: string): Promise<boolean> {
    const result = await this.git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return result.exitCode === 0 && result.stdout === "true";
  }

  /**
   * Check whether a remote exists (origin by default).
   */
  static async hasRemote(cwd: string, remote = "origin"): Promise<boolean> {
    const result = await this.git(cwd, ["remote", "get-url", remote]);
    return result.exitCode === 0 && result.stdout.length > 0;
  }

  /**
   * Generate branch name from task ID and title
   * Format: taskhive/{task-id-short}-{slug}
   */
  static generateBranchName(taskId: string, title: string): string {
    const shortId = taskId.slice(0, 8).toLowerCase();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    return `taskhive/${shortId}-${slug}`;
  }

  /**
   * Execute a git command in the given directory
   */
  private static async git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

      child.on("close", (exitCode) => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 1 });
      });

      child.on("error", (err) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  }

  /**
   * Create an isolated branch for a task.
   * Per docs section 18:
   *   git fetch origin
   *   git checkout main
   *   git pull origin main
   *   git checkout -b taskhive/{task-id}-{slug}
   */
  static async createBranch(cwd: string, taskId: string, title: string, baseBranch = "main"): Promise<BranchInfo> {
    const branchName = this.generateBranchName(taskId, title);

    const isGitRepo = await this.isGitRepository(cwd);
    if (!isGitRepo) {
      return {
        name: "non-git-worktree",
        created: false,
        baseBranch,
        isGitRepo: false,
        hasRemote: false,
      };
    }

    const hasRemote = await this.hasRemote(cwd, "origin");

    // Check if branch already exists
    const { stdout: existingBranches } = await this.git(cwd, ["branch", "--list", branchName]);
    if (existingBranches.includes(branchName)) {
      // Branch exists, just checkout
      await this.git(cwd, ["checkout", branchName]);
      return { name: branchName, created: false, baseBranch, isGitRepo, hasRemote };
    }

    if (hasRemote) {
      await this.git(cwd, ["fetch", "origin"]);
    }

    // Stash any uncommitted changes
    await this.git(cwd, ["stash", "--include-untracked"]);

    // Checkout base branch and pull
    const checkoutResult = await this.git(cwd, ["checkout", baseBranch]);
    if (checkoutResult.exitCode !== 0) {
      // Base branch might not exist, try current branch
      console.warn(`[BranchManager] Could not checkout ${baseBranch}, using current branch`);
    } else {
      if (hasRemote) {
        // Pull latest only when origin exists.
        await this.git(cwd, ["pull", "origin", baseBranch]);
      }
    }

    // Create and checkout new branch
    const createResult = await this.git(cwd, ["checkout", "-b", branchName]);
    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create branch ${branchName}: ${createResult.stderr}`);
    }

    return { name: branchName, created: true, baseBranch, isGitRepo, hasRemote };
  }

  /**
   * Get the current branch name
   */
  static async getCurrentBranch(cwd: string): Promise<string> {
    const { stdout } = await this.git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return stdout;
  }

  /**
   * Checkout an existing branch
   */
  static async checkoutBranch(cwd: string, branchName: string): Promise<void> {
    const result = await this.git(cwd, ["checkout", branchName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to checkout branch ${branchName}: ${result.stderr}`);
    }
  }

  /**
   * Get git status (short format)
   */
  static async getStatus(cwd: string): Promise<string> {
    const { stdout } = await this.git(cwd, ["status", "--short"]);
    return stdout;
  }

  /**
   * Get the first commit hash in the repo (for diffing fresh repos without a base branch).
   */
  private static async getFirstCommit(cwd: string): Promise<string> {
    const { stdout } = await this.git(cwd, ["rev-list", "--max-parents=0", "HEAD"]);
    const firstCommit = stdout.trim().split("\n")[0];
    // Return the empty tree hash if no commits exist
    return firstCommit || "4b825dc642cb6eb9a060e54bf899d69f82cf7256";
  }

  /**
   * Get git diff stat between current branch and base branch.
   * Called AFTER stageAll() so all changes are staged.
   */
  static async getDiffStat(cwd: string, baseBranch = "main"): Promise<string> {
    const { exitCode: branchExists } = await this.git(cwd, ["rev-parse", "--verify", baseBranch]);
    const hasBase = branchExists === 0;

    let stdout = "";

    // Strategy 1: committed changes vs base
    if (hasBase) {
      const { stdout: revCount } = await this.git(cwd, ["rev-list", "--count", `${baseBranch}..HEAD`]);
      if (parseInt(revCount.trim() || "0", 10) > 0) {
        const result = await this.git(cwd, ["diff", "--stat", baseBranch, "HEAD"]);
        if (result.exitCode === 0 && result.stdout) stdout = result.stdout;
      }
    }

    // Strategy 2: staged changes stat
    if (!stdout) {
      const result = await this.git(cwd, ["diff", "--stat", "--cached"]);
      if (result.stdout) stdout = result.stdout;
    }

    // Strategy 3: staged vs base
    if (!stdout && hasBase) {
      const result = await this.git(cwd, ["diff", "--stat", "--cached", baseBranch]);
      if (result.exitCode === 0 && result.stdout) stdout = result.stdout;
    }

    // Strategy 4: against empty tree
    if (!stdout) {
      const emptyTree = "4b825dc642cb6eb9a060e54bf899d69f82cf7256";
      const result = await this.git(cwd, ["diff", "--stat", "--cached", emptyTree]);
      if (result.exitCode === 0 && result.stdout) stdout = result.stdout;
    }

    return stdout;
  }

  /**
   * Get full git diff between current branch and base branch.
   * Handles: committed changes, staged changes, untracked files (after git add -A).
   * Called AFTER stageAll() so all changes are staged.
   */
  static async getDiff(cwd: string, baseBranch = "main"): Promise<string> {
    // Check if base branch exists
    const { exitCode: branchExists } = await this.git(cwd, ["rev-parse", "--verify", baseBranch]);
    const hasBase = branchExists === 0;

    // Check if HEAD has any commits beyond base
    let hasNewCommits = false;
    if (hasBase) {
      const { stdout: revCount } = await this.git(cwd, ["rev-list", "--count", `${baseBranch}..HEAD`]);
      hasNewCommits = parseInt(revCount.trim() || "0", 10) > 0;
    }

    let stdout = "";

    // Strategy 1: If there are new commits on this branch, diff them against base
    if (hasBase && hasNewCommits) {
      const result = await this.git(cwd, ["diff", baseBranch, "HEAD"]);
      if (result.exitCode === 0 && result.stdout) stdout = result.stdout;
    }

    // Strategy 2: Staged changes (after git add -A, this captures ALL new/modified files)
    if (!stdout) {
      const result = await this.git(cwd, ["diff", "--cached"]);
      if (result.stdout) stdout = result.stdout;
    }

    // Strategy 3: Staged changes against base branch
    if (!stdout && hasBase) {
      const result = await this.git(cwd, ["diff", "--cached", baseBranch]);
      if (result.exitCode === 0 && result.stdout) stdout = result.stdout;
    }

    // Strategy 4: Diff against empty tree (for brand new repos with no prior commits)
    if (!stdout) {
      const emptyTree = "4b825dc642cb6eb9a060e54bf899d69f82cf7256";
      const result = await this.git(cwd, ["diff", "--cached", emptyTree]);
      if (result.exitCode === 0 && result.stdout) stdout = result.stdout;
    }

    // Strategy 5: Unstaged changes (shouldn't happen after stageAll, but just in case)
    if (!stdout) {
      const result = await this.git(cwd, ["diff"]);
      if (result.stdout) stdout = result.stdout;
    }

    return stdout;
  }

  /**
   * Delete a task branch (cleanup)
   */
  static async deleteBranch(cwd: string, branchName: string, baseBranch = "main"): Promise<void> {
    // Switch to base branch first
    await this.git(cwd, ["checkout", baseBranch]);
    // Delete the branch
    await this.git(cwd, ["branch", "-D", branchName]);
  }

  /**
   * Stage all changes (including untracked files) so they appear in diff --cached.
   */
  static async stageAll(cwd: string): Promise<void> {
    await this.git(cwd, ["add", "-A"]);
  }

  /**
   * Check if the working directory is clean
   */
  static async isClean(cwd: string): Promise<boolean> {
    const status = await this.getStatus(cwd);
    return status.length === 0;
  }
}
