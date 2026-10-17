import pg from "pg";
import { migrationCompatible } from "../db/compatibility.js";
import { failureCode, log } from "./log.js";
export class Readiness {
  private probe: pg.Pool;
  private cached = false;
  private checkedAt = 0;
  private checking?: Promise<boolean>;
  private previous = "";
  constructor(
    url: string,
    private draining: () => boolean,
  ) {
    this.probe = new pg.Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 1000,
      idleTimeoutMillis: 5000,
      statement_timeout: 750,
      lock_timeout: 250,
    });
    this.probe.on("error", () => {
      this.cached = false;
      this.checkedAt = 0;
    });
  }
  async dependencyReady(): Promise<boolean> {
    if (Date.now() - this.checkedAt < 1000) return this.cached;
    if (this.checking) return this.checking;
    this.checking = (async () => {
      let code = "ready";
      try {
        await migrationCompatible(this.probe);
        await this.probe.query(
          "select id,locked_by,payload_hash from session_history_outbox limit 0",
        );
        await this.probe.query(
          "select final_order from session_participants limit 0",
        );
        const result = await this.probe.query(
          "select count(*)::int n,current_setting('fsync') as fsync from content_packs where owner_type='ruckus' and system_slug like '%-default' and status='ready' and archived_at is null",
        );
        this.cached = result.rows[0].n === 6 && result.rows[0].fsync === "on";
        if (!this.cached)
          code =
            result.rows[0].fsync !== "on"
              ? "DB_DURABILITY_UNSAFE"
              : "CONTENT_REQUIRED";
      } catch (error) {
        this.cached = false;
        code = failureCode(error);
      }
      if (code !== this.previous) {
        log("readiness.changed", { code }, this.cached ? "info" : "warn");
        this.previous = code;
      }
      this.checkedAt = Date.now();
      return this.cached;
    })().finally(() => {
      this.checking = undefined;
    });
    return this.checking;
  }
  async ready() {
    return !this.draining() && (await this.dependencyReady());
  }
  close() {
    return this.probe.end();
  }
}
