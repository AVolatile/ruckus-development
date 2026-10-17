import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectDatabase } from "../../server/db/client.js";
import { seedContent } from "../../server/content-packs/seed.js";
/** A separate disposable database prevents another test server from claiming injected jobs. */
export async function reliabilityDatabase() {
  const input = process.env.TEST_DATABASE_URL;
  if (!input || process.env.NODE_ENV === "production")
    throw Error("Explicit test database required.");
  const url = new URL(input);
  if (
    !["127.0.0.1", "localhost", "postgres"].includes(url.hostname) ||
    !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(url.pathname)
  )
    throw Error("Isolated local/CI database only.");
  const admin = connectDatabase(input),
    name = "ruckus_test_reliability" + randomUUID().replaceAll("-", "");
  await admin.pool.query(`create database "${name}"`);
  url.pathname = "/" + name;
  const connection = connectDatabase(url.href);
  try {
    await migrate(connection.db, { migrationsFolder: "migrations" });
    await seedContent(connection.db, true);
  } catch (error) {
    await connection.pool.end();
    await admin.pool.query(`drop database "${name}"`);
    await admin.pool.end();
    throw error;
  }
  return {
    ...connection,
    url: url.href,
    async close() {
      await connection.pool.end();
      await admin.pool.query(`drop database "${name}"`);
      await admin.pool.end();
    },
  };
}
