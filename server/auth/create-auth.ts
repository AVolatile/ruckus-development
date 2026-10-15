import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "../db/client.js";
import * as schema from "../db/auth-schema.js";
export function createAuthentication(
  db: Database,
  env: { origin: string; secret: string; production: boolean },
) {
  return betterAuth({
    appName: "Ruckus",
    baseURL: env.origin,
    basePath: "/api/auth",
    secret: env.secret,
    database: drizzleAdapter(db, { provider: "pg", transaction: true, schema }),
    trustedOrigins: [env.origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      // Better Auth otherwise prepends __Secure- even to a custom __Host- name.
      // Explicit attributes keep every production cookie secure with the exact host-only name.
      useSecureCookies: false,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: env.production,
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        session_token: {
          name: env.production
            ? "__Host-ruckus.session_token"
            : "ruckus.session_token",
          attributes: {
            httpOnly: true,
            secure: env.production,
            sameSite: "lax",
            path: "/",
          },
        },
      },
      ipAddress: { ipAddressHeaders: [] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, email: user.email.trim().toLowerCase() },
          }),
        },
      },
    },
    logger: { disabled: true },
  });
}
