import { cloudEnvironment } from "../auth/environment.js";
import { allowedOrigins, publicAppOrigin } from "../config.js";
import { emailConfiguration } from "../email/transport.js";
export function startupConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.NODE_ENV &&
    !["development", "test", "production"].includes(env.NODE_ENV)
  )
    throw Error("NODE_ENV must be development, test or production.");
  const cloud = cloudEnvironment(env);
  emailConfiguration(env);
  const database = new URL(cloud.databaseUrl);
  if (
    env.NODE_ENV === "test" &&
    (!env.TEST_DATABASE_URL ||
      cloud.databaseUrl !== env.TEST_DATABASE_URL ||
      !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(database.pathname) ||
      !["127.0.0.1", "localhost", "postgres"].includes(database.hostname))
  )
    throw Error(
      "Test startup requires its explicit isolated TEST_DATABASE_URL.",
    );
  if (
    cloud.production &&
    (/example|change.?me|development|test.secret/i.test(cloud.secret) ||
      new Set(cloud.secret).size < 8 ||
      /test|development/i.test(database.pathname))
  )
    throw Error(
      "Production requires separate database and random authentication configuration.",
    );
  if (env.TRUST_PROXY && env.TRUST_PROXY !== "loopback")
    throw Error("TRUST_PROXY requires a reviewed loopback policy.");
  const origins = allowedOrigins(env),
    publicOrigin = publicAppOrigin(env);
  if (
    cloud.production &&
    (origins.some((o) => o !== cloud.origin) ||
      (publicOrigin && publicOrigin !== cloud.origin))
  )
    throw Error(
      "Production host, API and socket origins must match APP_ORIGIN.",
    );
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    throw Error("SMTP_SECURE must be true or false.");
  if (env.DRAIN_MODE && !["true", "false"].includes(env.DRAIN_MODE))
    throw Error("DRAIN_MODE must be true or false.");
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max)
      throw Error(`Invalid ${key}.`);
    return n;
  };
  return {
    ...cloud,
    origins,
    port: integer("PORT", 4310, 1, 65535),
    workerConcurrency: integer("HISTORY_WORKER_CONCURRENCY", 2, 1, 4),
    workerPollMs: integer("HISTORY_POLL_MS", 1000, 100, 30000),
    shutdownMs: integer("SHUTDOWN_TIMEOUT_MS", 20000, 1000, 60000),
    draining: env.DRAIN_MODE === "true",
  };
}
