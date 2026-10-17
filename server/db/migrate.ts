import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectDatabase } from "./client.js";
import { migrationCompatible } from "./compatibility.js";
import { log, failureCode } from "../ops/log.js";
import type { PoolClient } from "pg";
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for migrations.");
const { pool, db } = connectDatabase(process.env.DATABASE_URL, true);
let client: PoolClient | undefined;
try {
  client = await pool.connect();
  const lock = await client.query(
    "select pg_try_advisory_lock(724826601) as acquired",
  );
  if (!lock.rows[0].acquired) throw Error("Another migration is running.");
  await migrationCompatible(client, false);
  await migrate(db, { migrationsFolder: "migrations" });
  await migrationCompatible(client);
  log("migration.completed");
} catch (error) {
  log(
    "migration.failed",
    {
      code:
        failureCode(error) === "MIGRATION_REQUIRED"
          ? "MIGRATION_REQUIRED"
          : "MIGRATION_FAILED",
    },
    "error",
  );
  process.exitCode = 1;
} finally {
  if (client) {
    try {
      await client.query("select pg_advisory_unlock(724826601)");
    } catch {
      /* A lost connection already released session locks. */
    }
    client.release();
  }
  await pool.end();
}
