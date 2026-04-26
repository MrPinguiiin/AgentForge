export interface GitStatus {
  isClean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
  conflicted: string[];
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
}

export interface GitCommitResult {
  hash: string;
  message: string;
  author: string;
  date: Date;
  filesChanged: number;
}

export interface GitLogEntry {
  hash: string;
  abbreviatedHash: string;
  message: string;
  body: string;
  author: string;
  authorEmail: string;
  date: Date;
  refs: string;
}

export interface GitPushResult {
  success: boolean;
  remote: string;
  branch: string;
  error?: string;
}
