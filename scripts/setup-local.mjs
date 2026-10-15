import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const password = randomBytes(24).toString("hex");
const config = `# Generated local development secrets; never commit this file.\nPOSTGRES_USER=ruckus\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=ruckus_development\nDATABASE_URL=postgresql://ruckus:${password}@127.0.0.1:55432/ruckus_development\nAUTH_SECRET=${randomBytes(48).toString("base64url")}\nAPP_ORIGIN=http://localhost:4310\nPUBLIC_APP_URL=http://localhost:4310\n`;
try {
  await writeFile(".env", config, { flag: "wx", mode: 0o600 });
  console.log("Local .env created. Start the database, then run migrations.");
} catch (error) {
  if (error.code === "EEXIST")
    throw new Error(
      ".env already exists; it was preserved. Configure it using .env.example.",
    );
  throw error;
}
