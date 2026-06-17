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

    const migrationsDir = join(__dirname, "migrations");
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    if (sqlFiles.length === 0) {
      console.log("No migration files found");
      return;
    }

    console.log(`Found ${sqlFiles.length} migration file(s)`);

    for (const file of sqlFiles) {
      const filePath = join(migrationsDir, file);
      const sql = await readFile(filePath, "utf-8");

      console.log(`Executing migration: ${file}`);
      await client.query(sql);
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
