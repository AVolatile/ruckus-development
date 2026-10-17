import { log } from "./ops/log.js";
try {
  await import("./index.js");
} catch {
  log("process.startup_failed", { code: "CONFIG_INVALID" }, "error");
  process.exit(1);
}
