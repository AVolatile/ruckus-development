import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod/v3";
import { WorkspaceService } from "../workspaces/service.js";
import { BrandService } from "../brand/service.js";
import { PostgresBrandAssetStore } from "../brand/assets.js";
import { BoardService } from "../boards/service.js";
import type { Database } from "../db/client.js";
import type { EmailTransport } from "../email/transport.js";
import { roles } from "../../shared/workspaces.js";
import { boardWriteSchema, importBatchSchema } from "../../shared/cloud.js";
import { RateLimiter } from "../validation.js";
import { ApiError } from "./errors.js";
const uuid = z.string().uuid();
const safe =
  (f: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void f(req, res).catch(next);
  };
const offset = (req: Request) =>
  z.coerce.number().int().min(0).max(10000).default(0).parse(req.query.offset);
function cursor<T>(value: unknown, schema: z.ZodType<T>): T | undefined {
  if (value === undefined) return;
  try {
    return schema.parse(
      JSON.parse(
        Buffer.from(z.string().max(512).parse(value), "base64url").toString(),
      ),
    );
  } catch {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "That page is no longer valid. Reload and try again.",
    );
  }
}
export function installWorkspaceApi(
  app: Express,
  db: Database,
  mail: EmailTransport,
  origin: string,
) {
  const ws = new WorkspaceService(db, mail, origin),
    boards = new BoardService(db),
    brands = new BrandService(db),
    assets = new PostgresBrandAssetStore(db),
    limits = new RateLimiter();
  const sweep = setInterval(() => limits.sweep(), 60000);
  sweep.unref();
  const base = "/api/v1/workspaces",
    scoped = base + "/:workspaceId";
  const actor = (r: Response) => String(r.locals.user.id);
  const wid = (r: Request) => uuid.parse(r.params.workspaceId);
  const id = (r: Request, key: string) => uuid.parse(r.params[key]);
  const limited = (req: Request, res: Response, key: string, max: number) => {
    for (const dimension of [actor(res), req.ip])
      if (!limits.allow(`${key}:${dimension}`, max, 60000))
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Too many attempts. Wait a minute and try again.",
        );
  };
  app.get(
    base,
    safe(async (_q, r) => r.json({ items: await ws.list(actor(r)) })),
  );
  app.post(
    base,
    safe(async (q, r) => {
      limited(q, r, "create-workspace", 5);
      const input = z.object({ name: z.string() }).strict().parse(q.body);
      r.status(201).json(await ws.create(actor(r), input.name));
    }),
  );
  app.get(
    scoped,
    safe(async (q, r) => r.json(await ws.get(actor(r), wid(q)))),
  );
  app.patch(
    scoped,
    safe(async (q, r) => {
      const input = z.object({ name: z.string() }).strict().parse(q.body);
      await ws.update(actor(r), wid(q), input.name);
      r.status(204).end();
    }),
  );
  app.post(
    scoped + "/archive",
    safe(async (q, r) => {
      await ws.archive(actor(r), wid(q));
      r.status(204).end();
    }),
  );
  app.get(
    scoped + "/members",
    safe(async (q, r) => r.json(await ws.members(actor(r), wid(q), offset(q)))),
  );
  app.patch(
    scoped + "/members/:userId",
    safe(async (q, r) => {
      const { role } = z
        .object({ role: z.enum(roles) })
        .strict()
        .parse(q.body);
      await ws.changeMember(
        actor(r),
        wid(q),
        z.string().min(1).max(128).parse(q.params.userId),
        role,
      );
      r.status(204).end();
    }),
  );
  app.delete(
    scoped + "/members/:userId",
    safe(async (q, r) => {
      await ws.changeMember(
        actor(r),
        wid(q),
        z.string().min(1).max(128).parse(q.params.userId),
      );
      r.status(204).end();
    }),
  );
  app.get(
    scoped + "/invitations",
    safe(async (q, r) => r.json({ items: await ws.pending(actor(r), wid(q)) })),
  );
  app.post(
    scoped + "/invitations",
    safe(async (q, r) => {
      limited(q, r, "invite", 10);
      r.status(201).json(await ws.invite(actor(r), wid(q), q.body));
    }),
  );
  app.delete(
    scoped + "/invitations/:invitationId",
    safe(async (q, r) => {
      await ws.revoke(actor(r), wid(q), id(q, "invitationId"));
      r.status(204).end();
    }),
  );
  app.post(
    "/api/v1/invitations/:token/accept",
    safe(async (q, r) => {
      limited(q, r, "accept-invite", 20);
      r.json(
        await ws.accept(
          actor(r),
          z
            .string()
            .regex(/^[A-Za-z0-9_-]{43}$/)
            .parse(q.params.token),
        ),
      );
    }),
  );
  app.get(
    scoped + "/activity",
    safe(async (q, r) =>
      r.json(
        await ws.activity(
          actor(r),
          wid(q),
          cursor(
            q.query.cursor,
            z.object({ createdAt: z.string().datetime(), id: uuid }).strict(),
          ),
        ),
      ),
    ),
  );
  app.get(
    scoped + "/boards",
    safe(async (q, r) => {
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(30)
        .parse(q.query.limit);
      r.json(
        await boards.list(
          actor(r),
          limit,
          cursor(
            q.query.cursor,
            z.object({ updatedAt: z.string().datetime(), id: uuid }).strict(),
          ),
          wid(q),
        ),
      );
    }),
  );
  app.post(
    scoped + "/boards",
    safe(async (q, r) => {
      const input = boardWriteSchema
        .omit({ baseRevisionId: true })
        .parse(q.body);
      r.status(201).json(
        await boards.create(
          actor(r),
          input.board,
          input.clientKey,
          "studio",
          wid(q),
        ),
      );
    }),
  );
  app.post(
    scoped + "/boards/import",
    safe(async (q, r) => {
      const input = importBatchSchema.parse(q.body);
      const results = await boards.import(
        actor(r),
        input.boards.map((b) => ({ key: b.key, board: b.board })),
        wid(q),
      );
      r.status(results.some((a) => a.code) ? 207 : 200).json({ results });
    }),
  );
  app.get(
    scoped + "/boards/:boardId",
    safe(async (q, r) =>
      r.json(await boards.get(actor(r), id(q, "boardId"), wid(q))),
    ),
  );
  app.put(
    scoped + "/boards/:boardId",
    safe(async (q, r) => {
      const input = boardWriteSchema
        .extend({ baseRevisionId: uuid })
        .omit({ clientKey: true })
        .parse(q.body);
      r.json(
        await boards.save(
          actor(r),
          id(q, "boardId"),
          input.board,
          input.baseRevisionId,
          wid(q),
        ),
      );
    }),
  );
  app.delete(
    scoped + "/boards/:boardId",
    safe(async (q, r) => {
      await boards.delete(actor(r), id(q, "boardId"), wid(q));
      r.status(204).end();
    }),
  );
  app.post(
    scoped + "/boards/:boardId/copy",
    safe(async (q, r) => {
      const input = z
        .object({ targetWorkspaceId: uuid })
        .strict()
        .parse(q.body);
      r.status(201).json(
        await boards.copy(
          actor(r),
          wid(q),
          id(q, "boardId"),
          input.targetWorkspaceId,
        ),
      );
    }),
  );
  app.get(
    scoped + "/brand-kits",
    safe(async (q, r) =>
      r.json(await brands.list(actor(r), wid(q), offset(q))),
    ),
  );
  app.post(
    scoped + "/brand-kits",
    safe(async (q, r) =>
      r.status(201).json(await brands.write(actor(r), wid(q), q.body)),
    ),
  );
  app.get(
    scoped + "/brand-kits/:brandKitId",
    safe(async (q, r) =>
      r.json(await brands.get(actor(r), wid(q), id(q, "brandKitId"))),
    ),
  );
  app.put(
    scoped + "/brand-kits/:brandKitId",
    safe(async (q, r) =>
      r.json(await brands.write(actor(r), wid(q), q.body, id(q, "brandKitId"))),
    ),
  );
  app.delete(
    scoped + "/brand-kits/:brandKitId",
    safe(async (q, r) => {
      await brands.delete(actor(r), wid(q), id(q, "brandKitId"));
      r.status(204).end();
    }),
  );
  app.post(
    scoped + "/brand-kits/:brandKitId/default",
    safe(async (q, r) => {
      await brands.setDefault(actor(r), wid(q), id(q, "brandKitId"));
      r.status(204).end();
    }),
  );
  app.post(
    scoped + "/brand-assets",
    (q, r, n) => {
      try {
        limited(q, r, "upload", 15);
        z.enum(["logo", "background"]).parse(q.query.kind);
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(
            q.headers["content-type"] || "",
          )
        )
          throw new ApiError(
            400,
            "INVALID_IMAGE",
            "Choose a PNG, JPEG or WebP image.",
          );
        n();
      } catch (e) {
        n(e);
      }
    },
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "5mb",
      inflate: false,
    }),
    safe(async (q, r) => {
      r.status(201).json(
        await assets.put(
          actor(r),
          wid(q),
          z.enum(["logo", "background"]).parse(q.query.kind),
          String(q.headers["content-type"]),
          q.body,
        ),
      );
    }),
  );
  app.get(
    scoped + "/brand-assets/:assetId",
    safe(async (q, r) => {
      const row = await assets.get(actor(r), wid(q), id(q, "assetId"));
      r.set({
        "Content-Type": row.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        ETag: `"${row.contentHash}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
      });
      if (q.headers["if-none-match"] === `"${row.contentHash}"`)
        r.status(304).end();
      else r.send(row.binaryContent);
    }),
  );
  app.delete(
    scoped + "/brand-assets/:assetId",
    safe(async (q, r) => {
      await assets.delete(actor(r), wid(q), id(q, "assetId"));
      r.status(204).end();
    }),
  );
}
