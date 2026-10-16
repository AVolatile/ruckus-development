import "dotenv/config";
import pg from "pg";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const source = new URL(process.env.DATABASE_URL || "");
if (
  process.env.NODE_ENV === "production" ||
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  source.pathname !== "/ruckus_development"
)
  throw new Error(
    "Test setup only supports a local ruckus_development cluster. No database was changed.",
  );
const client = new pg.Client({ connectionString: source.toString() });
await client.connect();
try {
  const existing = await client.query(
    "select 1 from pg_database where datname = 'ruckus_test'",
  );
  if (!existing.rowCount) await client.query("create database ruckus_test");
} finally {
  await client.end();
}
source.pathname = "/ruckus_test";
await writeFile(".env.test", `TEST_DATABASE_URL=${source}\n`, { mode: 0o600 });
const child = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/migrate.ts"],
  {
    env: { ...process.env, DATABASE_URL: source.toString() },
    stdio: "inherit",
  },
);
if (child.status) process.exit(child.status);
const seed = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/content.ts", "seed"],
  {
    env: { ...process.env, DATABASE_URL: source.toString() },
    stdio: "inherit",
  },
);
if (seed.status) process.exit(seed.status);
console.log("Local test database prepared. Its URL is in ignored .env.test.");
