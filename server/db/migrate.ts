import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectDatabase } from "./client.js";
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for migrations.");
const { pool, db } = connectDatabase(process.env.DATABASE_URL);
try {
  await migrate(db, { migrationsFolder: "migrations" });
  console.log("Database migrations applied.");
} catch {
  console.error(
    "Migration failed. Check database connectivity and migration state; no credentials are logged.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
