import "dotenv/config";
import { z } from "zod/v3";
import { connectDatabase } from "../db/client.js";
import { HistoryOutbox } from "../history/outbox.js";
import { log } from "./log.js";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required.");
const [mode = "inspect", rawId] = process.argv.slice(2);
const id = mode === "retry" ? z.string().uuid().parse(rawId) : undefined;
if (!["inspect", "retry", "prune"].includes(mode))
  throw Error("Use inspect, retry <session UUID>, or prune.");
const { db, pool } = connectDatabase(process.env.DATABASE_URL),
  outbox = new HistoryOutbox(db);
try {
  if (mode === "retry")
    log("history.operator_retry", {
      sessionId: id,
      count: (await outbox.retry(id!)).length,
    });
  else if (mode === "prune")
    log("history.operator_prune", { count: (await outbox.prune()) ?? 0 });
  else {
    console.log(
      JSON.stringify({
        event: "history.queue_snapshot",
        queue: await outbox.snapshot(),
      }),
    );
    const failed = await pool.query(
      "select id,workspace_id,attempt_count,last_error_code,updated_at,(payload is not null) as retryable from session_history_outbox where status='failed' order by updated_at desc limit 50",
    );
    console.log(
      JSON.stringify({ event: "history.failed", items: failed.rows }),
    );
  }
} catch {
  log("history.operator_failed", {}, "error");
  process.exitCode = 1;
} finally {
  await pool.end();
}
