import "dotenv/config";
import { cloudEnvironment } from "./environment.js";
import { connectDatabase } from "../db/client.js";
import { createAuthentication } from "./create-auth.js";
const env = cloudEnvironment();
export const { pool, db } = connectDatabase(env.databaseUrl);
export const auth = createAuthentication(db, env);
