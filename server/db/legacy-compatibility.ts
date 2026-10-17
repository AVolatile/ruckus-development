import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
/** Local Phase 2 applied hash predates its final commit. Never rewrite that ledger.
 * Accepted only with the exact independently fresh-migrated Phase 5 catalog below.
 * Fresh installations use ordinary strict migration hashes and never enter here. */
export const legacyPhase2Hash =
  "5c4f8d7fb8d9cb8f357ff304e8f81abb5bf1d4e612ade6f78ec2db5abac69ab1";
export const catalogSql = `select kind,name,definition from (
select 'column' kind,table_name||'.'||column_name name,data_type||coalesce(udt_name,'')||is_nullable||coalesce(column_default,'') definition from information_schema.columns where table_schema='public' and table_name not like 'session_history_%'
union all select 'constraint',conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and conrelid::regclass::text not like 'session_history_%'
union all select 'index',tablename||'.'||indexname,indexdef from pg_indexes where schemaname='public' and tablename not like 'session_history_%'
union all select 'function',proname,pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace
union all select 'trigger',tgrelid::regclass::text||'.'||tgname,pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in(select oid from pg_class where relnamespace='public'::regnamespace) and tgrelid::regclass::text not like 'session_history_%'
) objects order by kind,name`;
export async function legacyCatalogMatches(connection: Pool | PoolClient) {
  const { rows } = await connection.query(catalogSql);
  return (
    createHash("sha256").update(JSON.stringify(rows)).digest("hex") ===
    "b94254bddbd7ad8aaf60aba495cb4eafb908caa9d16db04dfaff1c88de2c4c54"
  );
}
