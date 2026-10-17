import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { log } from "../ops/log.js";
export function connectDatabase(url: string, migration = false) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: migration ? 120000 : 5000,
    lock_timeout: migration ? 10000 : 3000,
    idle_in_transaction_session_timeout: migration ? 120000 : 10000,
    options: `-c transaction_timeout=${migration ? 120000 : 15000}`,
  });
  pool.on("error", () =>
    log("database.connection_interrupted", { code: "DB_UNAVAILABLE" }, "error"),
  );
  // PostgreSQL can terminate an acquired idle transaction between awaited operations.
  // Keep a listener while checked out as well as the pool's idle-client listener.
  pool.on("connect", (client) =>
    client.on("error", () =>
      log("database.client_interrupted", { code: "DB_UNAVAILABLE" }, "warn"),
    ),
  );
  return { pool, db: drizzle(pool) };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
