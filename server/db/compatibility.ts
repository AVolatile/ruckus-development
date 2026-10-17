import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool, PoolClient } from "pg";
import { OperationalError } from "../ops/log.js";
import {
  legacyPhase2Hash,
  legacyCatalogMatches,
} from "./legacy-compatibility.js";
const expected = readMigrationFiles({ migrationsFolder: "migrations" });
export async function migrationCompatible(
  connection: Pool | PoolClient,
  required = true,
) {
  const exists = await connection.query(
    "select to_regclass('drizzle.__drizzle_migrations') as name",
  );
  if (!exists.rows[0].name) {
    if (required) throw new OperationalError("MIGRATION_REQUIRED");
    return;
  }
  const { rows } = await connection.query<{ hash: string; created_at: string }>(
    "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
  );
  for (const migration of expected) {
    const matches = rows.filter(
      (r) => Number(r.created_at) === migration.folderMillis,
    );
    if (matches.length > 1) throw new OperationalError("MIGRATION_REQUIRED");
    const actual = matches[0];
    if (required && !actual) throw new OperationalError("MIGRATION_REQUIRED");
    if (
      !actual &&
      rows.some((r) => Number(r.created_at) > migration.folderMillis)
    )
      throw new OperationalError("MIGRATION_REQUIRED");
    if (actual && actual.hash !== migration.hash) {
      if (
        migration !== expected[2] ||
        actual.hash !== legacyPhase2Hash ||
        !(await legacyCatalogMatches(connection))
      )
        throw new OperationalError("MIGRATION_REQUIRED");
    }
  }
}
