import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getDatabase, closeDatabase } from "./client.js";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Run database migrations.
 *
 * Usage:
 *   bun run src/db/migrate.ts [dbPath]
 *
 * If no dbPath is provided, defaults to .ai-coder/ai-coder.db
 */
function main() {
  const dbPath = process.argv[2] || ".ai-coder/ai-coder.db";

  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`Running migrations on: ${dbPath}`);

  const db = getDatabase(dbPath);

  // Resolve migrations folder relative to this file
  const migrationsFolder = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "./migrations"
  );

  if (!fs.existsSync(migrationsFolder)) {
    console.log("No migrations folder found. Skipping Drizzle migrations.");
    console.log("Tables will be created via initializeDatabase() instead.");
    closeDatabase();
    return;
  }

  try {
    migrate(db, { migrationsFolder });
    console.log("Migrations completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

main();
