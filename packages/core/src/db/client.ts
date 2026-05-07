import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";

let db: BunSQLiteDatabase<typeof schema> | null = null;
let sqlite: Database | null = null;

export function getDatabase(dbPath: string): BunSQLiteDatabase<typeof schema> {
  if (db) return db;

  sqlite = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrent read performance
  sqlite.exec("PRAGMA journal_mode = WAL");
  // Enable foreign key constraints
  sqlite.exec("PRAGMA foreign_keys = ON");

  db = drizzle(sqlite, { schema });
  return db;
}

export function getRawSqlite(): Database | null {
  return sqlite;
}

export function initializeDatabase(dbPath: string): BunSQLiteDatabase<typeof schema> {
  const database = getDatabase(dbPath);

  // ===== Core tables =====
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      description TEXT,
      framework TEXT,
      language TEXT,
      default_branch TEXT DEFAULT 'main',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      acceptance_criteria TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      agent_type TEXT,
      branch TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      metadata TEXT,
      routed_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS task_labels (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS task_files (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      action TEXT DEFAULT 'modify',
      status TEXT NOT NULL DEFAULT 'pending',
      diff TEXT,
      original_content TEXT,
      modified_content TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      input TEXT,
      output TEXT,
      error TEXT,
      tokens_used INTEGER,
      duration_ms INTEGER,
      model TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // ===== New tables (TaskHive docs alignment) =====

  // Task Runs - proper run tracking per docs section 14
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      agent_name TEXT,
      command TEXT,
      exit_code INTEGER,
      stdout TEXT,
      stderr TEXT,
      error TEXT,
      tokens_used INTEGER,
      duration_ms INTEGER,
      model TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Task Plans - planning output storage per docs section 14
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS task_plans (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
      summary TEXT,
      plan_json TEXT NOT NULL,
      recommended_agent TEXT,
      risk_level TEXT,
      needs_human INTEGER DEFAULT 0,
      approved INTEGER DEFAULT 0,
      approved_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Task Artifacts - git diff, test logs, etc per docs section 14
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS task_artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL,
      content TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Job Queue - SQLite-backed async job queue
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      result TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      priority INTEGER NOT NULL DEFAULT 0,
      locked_at INTEGER,
      scheduled_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // ===== Indexes =====
  sqlite!.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_task_labels_task_id ON task_labels(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_labels_category ON task_labels(category);
    CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_runs_task_id ON task_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_runs_status ON task_runs(status);
    CREATE INDEX IF NOT EXISTS idx_task_plans_task_id ON task_plans(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_id ON task_artifacts(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_artifacts_run_id ON task_artifacts(run_id);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
    CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue(type);
    CREATE INDEX IF NOT EXISTS idx_job_queue_task_id ON job_queue(task_id);
  `);

  // ===== Migrations for existing databases =====
  const columnMigrations = [
    "ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT",
    "ALTER TABLE tasks ADD COLUMN branch TEXT",
    "ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3",
    "ALTER TABLE tasks ADD COLUMN routed_at INTEGER",
    "ALTER TABLE tasks ADD COLUMN started_at INTEGER",
    "ALTER TABLE tasks ADD COLUMN completed_at INTEGER",
    "ALTER TABLE projects ADD COLUMN default_branch TEXT DEFAULT 'main'",
    "ALTER TABLE task_files ADD COLUMN action TEXT DEFAULT 'modify'",
  ];

  for (const migration of columnMigrations) {
    try {
      sqlite!.exec(migration);
    } catch {
      // Column already exists - ignore
    }
  }

  // Migrate old status values
  try {
    sqlite!.exec("UPDATE tasks SET status = 'backlog' WHERE status = 'todo'");
  } catch {
    // Ignore
  }

  return database;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
