import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  createEmailTransport,
  actionEmail,
  type EmailTransport,
} from "../email/transport.js";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "../db/client.js";
import * as schema from "../db/auth-schema.js";
export function createAuthentication(
  db: Database,
  env: { origin: string; secret: string; production: boolean },
  email: EmailTransport = createEmailTransport({
    ...process.env,
    NODE_ENV: env.production ? "production" : process.env.NODE_ENV,
  }),
) {
  const tokenHash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  return betterAuth({
    onAPIError: {
      onError(error) {
        if (!(error instanceof APIError))
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message:
              "Ruckus couldn’t finish this account request. Try again shortly.",
          });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/verify-email") return;
        const token = ctx.query?.token;
        if (typeof token !== "string" || token.length > 2048)
          throw new APIError("UNAUTHORIZED", {
            message: "This verification link is invalid or expired.",
          });
        const claimed = await db
          .delete(schema.verification)
          .where(
            and(
              eq(
                schema.verification.identifier,
                `email-once:${tokenHash(token)}`,
              ),
              gt(schema.verification.expiresAt, new Date()),
            ),
          )
          .returning({ id: schema.verification.id });
        if (!claimed.length)
          throw new APIError("UNAUTHORIZED", {
            message:
              "This verification link was used or expired. Request a fresh email if needed.",
          });
      }),
    },
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
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const url = new URL("/reset-password", env.origin);
        url.searchParams.set("token", token);
        await email.send(
          actionEmail(
            user.email,
            "Reset your password",
            "Choose a new password within 30 minutes. This link works once.",
            url.href,
            env.origin,
          ),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 3600,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, token }) => {
        const url = new URL("/verify-email", env.origin);
        url.searchParams.set("token", token);
        await db.insert(schema.verification).values({
          id: randomUUID(),
          identifier: `email-once:${tokenHash(token)}`,
          value: user.id,
          expiresAt: new Date(Date.now() + 3600000),
        });
        await email.send(
          actionEmail(
            user.email,
            "Verify your email",
            "Confirm your address within one hour to create or join a shared workspace.",
            url.href,
            env.origin,
          ),
        );
      },
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
