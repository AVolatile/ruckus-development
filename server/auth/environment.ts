export function cloudEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  if (!env.DATABASE_URL)
    throw new Error("DATABASE_URL is required. See docs/DATABASE.md.");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)
    throw new Error(
      "AUTH_SECRET must contain at least 32 random characters. See docs/AUTHENTICATION.md.",
    );
  let db: URL;
  try {
    db = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(db.protocol))
    throw new Error("DATABASE_URL must use PostgreSQL.");
  let origin: URL;
  try {
    origin = new URL(
      env.APP_ORIGIN || (production ? "" : "http://localhost:4310"),
    );
  } catch {
    throw new Error("APP_ORIGIN must be a valid application origin.");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    (production && origin.protocol !== "https:")
  )
    throw new Error("APP_ORIGIN must be an exact HTTPS origin in production.");
  if (
    production &&
    (!env.APP_ORIGIN || /^(localhost|127\.|\[::1\])/.test(origin.hostname))
  )
    throw new Error("Production APP_ORIGIN must be a public HTTPS origin.");
  if (production && env.REALTIME_ONLY === "true")
    throw new Error(
      "Phase 1 requires a same-origin app/API service. REALTIME_ONLY split hosting is not supported for host authentication.",
    );
  return {
    databaseUrl: env.DATABASE_URL,
    secret: env.AUTH_SECRET,
    origin: origin.origin,
    production,
  };
}
