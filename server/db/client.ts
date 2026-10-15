import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
export function connectDatabase(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () => console.error("Database connection interrupted."));
  return { pool, db: drizzle(pool) };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
