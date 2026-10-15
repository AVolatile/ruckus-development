import "dotenv/config";
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: ["./server/db/auth-schema.ts", "./server/db/schema.ts"],
  out: "./migrations",
});
