import { randomUUID } from "node:crypto";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { z } from "zod/v3";
import { sql } from "drizzle-orm";
import { auth, db } from "../auth/config.js";
import { cloudEnvironment } from "../auth/environment.js";
import { BoardService } from "../boards/service.js";
import { boardWriteSchema, importBatchSchema } from "../../shared/cloud.js";
import { RateLimiter } from "../validation.js";
import { ApiError } from "./errors.js";
const env = cloudEnvironment();
const service = new BoardService(db);
const limits = new RateLimiter();
const sweep = setInterval(() => limits.sweep(), 60000);
sweep.unref();
const safe =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
const uuid = z.string().uuid();
const cursorSchema = z
  .object({ updatedAt: z.string().datetime(), id: uuid })
  .strict();
export function installHostApi(app: Express) {
  if (process.env.TRUST_PROXY) {
    if (process.env.TRUST_PROXY !== "loopback")
      throw new Error(
        "TRUST_PROXY currently supports only loopback; use a reviewed proxy policy for other infrastructure.",
      );
    app.set("trust proxy", "loopback");
  }
  app.use("/api", (req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-ID", res.locals.requestId);
    res.setHeader("Cache-Control", "no-store");
    if (req.headers.host !== new URL(env.origin).host)
      return next(
        new ApiError(
          403,
          "ORIGIN_REJECTED",
          "Open Ruckus from its configured application address.",
        ),
      );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers.origin !== env.origin ||
        (req.headers["sec-fetch-site"] &&
          !["same-origin", "none"].includes(
            String(req.headers["sec-fetch-site"]),
          )))
    )
      return next(
        new ApiError(
          403,
          "ORIGIN_REJECTED",
          "This request didn’t come from your Ruckus app. Reload and try again.",
        ),
      );
    next();
  });
  app.use("/api/auth", (req, res, next) => {
    const max = req.path.includes("sign-up")
      ? 8
      : req.path.includes("sign-in")
        ? 20
        : 120;
    if (!limits.allow(`auth:${req.ip}:${req.path}`, max, 60000)) {
      res.setHeader("Retry-After", "60");
      return next(
        new ApiError(
          429,
          "RATE_LIMITED",
          "Too many attempts. Wait a minute and try again.",
        ),
      );
    }
    // Reject oversized declared bodies; the fetch handler below bounds streamed bodies too.
    if (Number(req.headers["content-length"] || 0) > 16384)
      return next(
        new ApiError(
          413,
          "VALIDATION_ERROR",
          "Keep account requests under 16 KB.",
        ),
      );
    next();
  });
  const handler = toNodeHandler(async (request) => {
    if (request.body && !["GET", "HEAD"].includes(request.method)) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > 16384) {
          await reader.cancel();
          return Response.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: "Keep account requests under 16 KB.",
              },
            },
            { status: 413 },
          );
        }
        chunks.push(part.value);
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        return Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "That request isn’t valid JSON.",
            },
          },
          { status: 400 },
        );
      }
      if (
        body &&
        typeof body === "object" &&
        "email" in body &&
        typeof body.email === "string"
      )
        body.email = body.email.trim().toLowerCase();
      const credentialPath = new URL(request.url).pathname;
      if (
        /\/(sign-in|sign-up)\/email$/.test(credentialPath) &&
        (!body ||
          typeof body !== "object" ||
          !("email" in body) ||
          typeof body.email !== "string" ||
          body.email.length > 254 ||
          !("password" in body) ||
          typeof body.password !== "string" ||
          body.password.length > 128)
      )
        return Response.json(
          {
            code: "VALIDATION_ERROR",
            message: "Check the account fields and try again.",
          },
          { status: 400 },
        );
      request = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(body),
      });
    }
    return auth.handler(request);
  });
  app.all("/api/auth/*", (req, res, next) => {
    void handler(req, res).catch(next);
  });
  app.use("/api/v1", express.json({ limit: "320kb", strict: true }));
  app.use("/api/v1", (req, res, next) => {
    void (async () => {
      if (!limits.allow(`api:${req.ip}`, 300, 60000))
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "A little too fast. Wait a minute and try again.",
        );
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session)
        throw new ApiError(
          401,
          "AUTH_REQUIRED",
          "Sign in to use your private Ruckus library.",
        );
      res.locals.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      };
      next();
    })().catch(next);
  });
  // Routes below use server-derived identity only.
  app.get("/api/v1/me", (_req, res) => res.json({ user: res.locals.user }));
  app.get(
    "/api/v1/boards",
    safe(async (req, res) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(30),
          cursor: z.string().max(512).optional(),
        })
        .strict()
        .parse(req.query);
      let cursor;
      if (query.cursor) {
        try {
          cursor = cursorSchema.parse(
            JSON.parse(Buffer.from(query.cursor, "base64url").toString()),
          );
        } catch {
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "That library page is no longer valid. Reload your library.",
          );
        }
      }
      res.json(await service.list(res.locals.user.id, query.limit, cursor));
    }),
  );
  app.post(
    "/api/v1/boards",
    safe(async (req, res) => {
      const input = boardWriteSchema
        .omit({ baseRevisionId: true })
        .parse(req.body);
      res
        .status(201)
        .json(
          await service.create(
            res.locals.user.id,
            input.board,
            input.clientKey,
          ),
        );
    }),
  );
  app.post(
    "/api/v1/boards/import",
    safe(async (req, res) => {
      const input = importBatchSchema.parse(req.body);
      const results = await service.import(
        res.locals.user.id,
        input.boards.map((item) => ({ key: item.key, board: item.board })),
      );
      res.status(results.some((r) => r.code) ? 207 : 200).json({ results });
    }),
  );
  app.get(
    "/api/v1/boards/:id",
    safe(async (req, res) =>
      res.json(
        await service.get(res.locals.user.id, uuid.parse(req.params.id)),
      ),
    ),
  );
  app.put(
    "/api/v1/boards/:id",
    safe(async (req, res) => {
      const input = boardWriteSchema
        .extend({ baseRevisionId: uuid })
        .omit({ clientKey: true })
        .parse(req.body);
      res.json(
        await service.save(
          res.locals.user.id,
          uuid.parse(req.params.id),
          input.board,
          input.baseRevisionId,
        ),
      );
    }),
  );
  app.delete(
    "/api/v1/boards/:id",
    safe(async (req, res) => {
      await service.delete(res.locals.user.id, uuid.parse(req.params.id));
      res.status(204).end();
    }),
  );
  app.get(
    "/ready",
    safe(async (_req, res) => {
      try {
        await db.execute(sql`select 1 from boards limit 0`);
        res.json({ status: "ready" });
      } catch {
        res.status(503).json({ status: "unavailable" });
      }
    }),
  );
  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "That API endpoint isn’t available.")),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) return next(error);
      const safeError =
        error instanceof ApiError
          ? error
          : error instanceof z.ZodError
            ? new ApiError(
                400,
                "VALIDATION_ERROR",
                "Check the request fields and board format.",
              )
            : (error as { type?: string })?.type === "entity.too.large"
              ? new ApiError(
                  413,
                  "VALIDATION_ERROR",
                  "Keep board requests under 320 KB.",
                )
              : error instanceof SyntaxError
                ? new ApiError(
                    400,
                    "VALIDATION_ERROR",
                    "That request isn’t valid JSON.",
                  )
                : new ApiError(
                    500,
                    "INTERNAL_ERROR",
                    "Ruckus couldn’t finish this request. Try again shortly.",
                  );
      if (safeError.status >= 500)
        console.error(`API failure ${res.locals.requestId || "unknown"}`);
      res.status(safeError.status).json({
        error: {
          code: safeError.code,
          message: safeError.message,
          requestId: res.locals.requestId,
          ...(safeError.details ? { details: safeError.details } : {}),
        },
      });
    },
  );
}
