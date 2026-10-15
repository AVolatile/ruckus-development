import "dotenv/config";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
config({ path: ".env.test", quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost", "postgres"].includes(url.hostname) ||
  !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(url.pathname)
)
  throw new Error(
    "Verification requires an explicit local/CI ruckus_test database.",
  );
const port = process.env.VERIFY_PORT || "4312",
  origin = `http://localhost:${port}`;
const args = process.argv.includes("--compiled")
  ? ["dist-server/server/index.js"]
  : ["--import", "tsx", "server/index.ts"];
const child = spawn(process.execPath, args, {
  env: {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: url.toString(),
    AUTH_SECRET:
      process.env.AUTH_SECRET || randomBytes(48).toString("base64url"),
    PORT: port,
    APP_ORIGIN: origin,
    PUBLIC_APP_URL: origin,
  },
  stdio: "inherit",
});
process.on("SIGINT", () => child.kill("SIGTERM"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code || 0));
