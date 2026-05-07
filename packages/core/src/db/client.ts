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

export function initializeDatabase(dbPath: string): BunSQLiteDatabase<typeof schema> {
  const database = getDatabase(dbPath);

  // Create tables if they don't exist
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      description TEXT,
      framework TEXT,
      language TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_task_labels_task_id ON task_labels(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_labels_category ON task_labels(category);
    CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
  `);

  return database;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
