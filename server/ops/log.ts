/** Fixed fields only. Never serialize caller objects, SQL, URLs or Error messages. */
export type FailureCode =
  | "CONFIG_INVALID"
  | "DB_UNAVAILABLE"
  | "DB_TIMEOUT"
  | "DB_CONFLICT"
  | "HISTORY_PAYLOAD_MISMATCH"
  | "HISTORY_PAYLOAD_INVALID"
  | "HISTORY_MATERIALIZE_FAILED"
  | "MIGRATION_REQUIRED"
  | "MIGRATION_FAILED"
  | "SHUTDOWN_TIMEOUT";
export class OperationalError extends Error {
  constructor(public code: FailureCode) {
    super(code);
  }
}
export function failureCode(error: unknown, depth = 0): FailureCode {
  if (error instanceof OperationalError) return error.code;
  const e = error as { code?: string; cause?: unknown } | null;
  if (e?.cause && e.cause !== error && depth < 5)
    return failureCode(e.cause, depth + 1);
  if (["57014", "55P03", "25P03", "25P04"].includes(e?.code ?? ""))
    return "DB_TIMEOUT";
  if (["23505", "40001", "40P01"].includes(e?.code ?? "")) return "DB_CONFLICT";
  if (["42P01", "42703"].includes(e?.code ?? "")) return "MIGRATION_REQUIRED";
  return "DB_UNAVAILABLE";
}
type Fields = {
  requestId?: string;
  workspaceId?: string;
  sessionId?: string;
  actorUserId?: string;
  attempt?: number;
  durationMs?: number;
  count?: number;
  code?: string;
  result?: string;
};
export function log(
  event: string,
  fields: Fields = {},
  level: "info" | "warn" | "error" = "info",
  sink: (line: string) => void = console.log,
) {
  const safe: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    event: /^[a-z0-9_.]+$/i.test(event) ? event : "operation",
  };
  for (const key of [
    "requestId",
    "workspaceId",
    "sessionId",
    "actorUserId",
    "attempt",
    "durationMs",
    "count",
    "code",
    "result",
  ] as const) {
    const v = fields[key];
    if (typeof v === "number" && Number.isFinite(v)) safe[key] = v;
    else if (typeof v === "string" && /^[a-z0-9_.:-]{1,128}$/i.test(v))
      safe[key] = v;
  }
  try {
    sink(JSON.stringify(safe));
  } catch {
    /* Logging cannot break gameplay. */
  }
}
/** Fixed key space: no tenant IDs/paths become metric labels. */
export const metrics = {
  materialized: 0,
  materializationFailures: 0,
  materializationMs: 0,
  enqueueFailures: 0,
  apiFailures: 0,
  roomCreateFailures: 0,
  cleanupMs: 0,
};
