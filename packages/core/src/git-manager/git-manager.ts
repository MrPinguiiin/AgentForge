import simpleGit, { type SimpleGit, type StatusResult } from "simple-git";
import type {
  GitStatus,
  GitCommitResult,
  GitLogEntry,
  GitPushResult,
} from "./types.js";

export class GitManager {
  private git: SimpleGit;
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.git = simpleGit(rootPath);
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.git.init();
  }

  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();

    return {
      isClean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
      deleted: status.deleted,
      renamed: status.renamed.map((r) => ({ from: r.from, to: r.to })),
      conflicted: status.conflicted,
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
    };
  }

  async getDiff(staged?: boolean): Promise<string> {
    if (staged) {
      return this.git.diff(["--cached"]);
    }
    return this.git.diff();
  }

  async add(files: string | string[]): Promise<void> {
    const fileList = Array.isArray(files) ? files : [files];
    await this.git.add(fileList);
  }

  async addAll(): Promise<void> {
    await this.git.add("-A");
  }

  async commit(message: string): Promise<GitCommitResult> {
    const result = await this.git.commit(message);

    return {
      hash: result.commit || "",
      message,
      author: "",
      date: new Date(),
      filesChanged: result.summary.changes,
    };
  }

  async autoCommit(prefix: string, description: string): Promise<GitCommitResult> {
    await this.addAll();
    const message = `${prefix}: ${description}`;
    return this.commit(message);
  }

  async push(
    remote: string = "origin",
    branch?: string
  ): Promise<GitPushResult> {
    try {
      const currentBranch = branch ?? (await this.getCurrentBranch());
      await this.git.push(remote, currentBranch);

      return {
        success: true,
        remote,
        branch: currentBranch,
      };
    } catch (error) {
      return {
        success: false,
        remote,
        branch: branch ?? "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getLog(maxCount: number = 20): Promise<GitLogEntry[]> {
    const log = await this.git.log({ maxCount });

    return log.all.map((entry) => ({
      hash: entry.hash,
      abbreviatedHash: entry.hash.substring(0, 7),
      message: entry.message,
      body: entry.body,
      author: entry.author_name,
      authorEmail: entry.author_email,
      date: new Date(entry.date),
      refs: entry.refs,
    }));
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current ?? "main";
  }

  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
  }

  async checkout(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
  }
}
