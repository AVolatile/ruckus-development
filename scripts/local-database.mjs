import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { access } from "node:fs/promises";
const url = new URL(process.env.DATABASE_URL || "");
if (
  process.env.NODE_ENV === "production" ||
  url.hostname !== "127.0.0.1" ||
  url.pathname !== "/ruckus_development"
)
  throw new Error(
    "Local database helper only supports loopback ruckus_development.",
  );
const pg = new EmbeddedPostgres({
  databaseDir: ".local/postgres",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port),
  authMethod: "scram-sha-256",
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
try {
  await access(".local/postgres/PG_VERSION");
} catch {
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
const exists = await client.query(
  "select 1 from pg_database where datname = $1",
  ["ruckus_development"],
);
await client.end();
if (!exists.rowCount) await pg.createDatabase("ruckus_development");
console.log(
  "Local PostgreSQL ready on loopback. Run npm run db:migrate, then npm run dev.",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
