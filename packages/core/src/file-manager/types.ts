export type FileOperationType = "create" | "modify" | "delete";

export interface FileOperation {
  type: FileOperationType;
  filePath: string;
  content?: string;
  diff?: string;
}

export interface FileContent {
  filePath: string;
  content: string;
  language: string;
  size: number;
  lastModified: Date;
}

export interface ProjectFileTree {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectFileTree[];
  size?: number;
  language?: string;
}

export interface DiffResult {
  filePath: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  patch: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ApplyResult {
  success: boolean;
  filePath: string;
  error?: string;
  backup?: string;
}
