import "dotenv/config";
import { validateBuiltIns } from "./built-ins.js";
import { seedContent } from "./seed.js";
import { connectDatabase } from "../db/client.js";
const mode = process.argv[2];
try {
  if (mode === "validate") console.table(validateBuiltIns());
  else {
    if (!["seed", "diff"].includes(mode) || !process.env.DATABASE_URL)
      throw new Error(
        "Choose validate, diff or seed; database operations require DATABASE_URL.",
      );
    const { db, pool } = connectDatabase(process.env.DATABASE_URL);
    try {
      console.table(await seedContent(db, mode === "seed"));
    } finally {
      await pool.end();
    }
  }
} catch (e) {
  console.error(
    e instanceof Error && e.message.startsWith("System pack")
      ? e.message
      : "Content command failed. Check validation, migration state and database connectivity. No credentials are logged.",
  );
  process.exitCode = 1;
}
