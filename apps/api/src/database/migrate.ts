import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/ict_forward_lab";

async function migrate(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("Connected to database");

    // Ledger of applied migrations. Files recorded here are skipped, so
    // migrations no longer need to be idempotent to survive the every-boot
    // run. Pre-ledger databases re-run everything once (all existing files
    // are IF NOT EXISTS, so that pass is harmless) and are recorded after.
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const appliedResult = await client.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations`,
    );
    const applied = new Set(appliedResult.rows.map((r) => r.filename));

    const migrationsDir = join(__dirname, "migrations");
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    if (sqlFiles.length === 0) {
      console.log("No migration files found");
      return;
    }

    const pending = sqlFiles.filter((f) => !applied.has(f));
    console.log(
      `Found ${sqlFiles.length} migration file(s), ${pending.length} pending`,
    );

    for (const file of pending) {
      const filePath = join(migrationsDir, file);
      const sql = await readFile(filePath, "utf-8");

      console.log(`Executing migration: ${file}`);
      // Migration + ledger insert commit atomically: a failed migration
      // rolls back entirely and stays pending.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [file],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      console.log(`  ✓ ${file} executed successfully`);
    }

    console.log("\nAll migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", (error as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
