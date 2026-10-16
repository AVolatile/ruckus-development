import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod/v3";
import { ContentPackService } from "../content-packs/service.js";
import type { Database } from "../db/client.js";
import {
  packDocumentSchema,
  packExportSchema,
} from "../../shared/content-packs.js";
import { RateLimiter } from "../validation.js";
import { ApiError } from "./errors.js";
const safe =
  (f: (q: Request, r: Response) => Promise<unknown>) =>
  (q: Request, r: Response, n: NextFunction) => {
    void f(q, r).catch(n);
  };
const uuid = z.string().uuid();
export function installContentPackApi(app: Express, db: Database) {
  const service = new ContentPackService(db),
    limits = new RateLimiter();
  const timer = setInterval(() => limits.sweep(), 60000);
  timer.unref();
  const actor = (r: Response) => String(r.locals.user.id),
    wid = (q: Request) => uuid.parse(q.params.workspaceId),
    id = (q: Request) => uuid.parse(q.params.packId);
  const limit = (q: Request, r: Response) => {
    for (const key of [q.ip, actor(r)])
      if (!limits.allow(`content:${key}`, 90, 60000))
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Wait a minute before saving more content.",
        );
  };
  for (const base of [
    "/api/v1/content-packs",
    "/api/v1/workspaces/:workspaceId/content-packs",
  ]) {
    const workspace = (q: Request) => (q.params.workspaceId ? wid(q) : null);
    app.get(
      base,
      safe(async (q, r) =>
        r.json(await service.list(actor(r), workspace(q), q.query)),
      ),
    );
    app.get(
      base + "/:packId",
      safe(async (q, r) =>
        r.json(await service.get(actor(r), workspace(q), id(q))),
      ),
    );
    app.post(
      base + "/:packId/copy",
      safe(async (q, r) => {
        limit(q, r);
        const input = z
          .object({ targetWorkspaceId: uuid })
          .strict()
          .parse(q.body);
        r.status(201).json(
          await service.copy(
            actor(r),
            workspace(q),
            id(q),
            input.targetWorkspaceId,
          ),
        );
      }),
    );
  }
  const base = "/api/v1/workspaces/:workspaceId/content-packs";
  app.post(
    base,
    safe(async (q, r) => {
      limit(q, r);
      const { document } = z
        .object({ document: packDocumentSchema })
        .strict()
        .parse(q.body);
      r.status(201).json(await service.create(actor(r), wid(q), document));
    }),
  );
  app.post(
    base + "/import",
    safe(async (q, r) => {
      limit(q, r);
      const input = packExportSchema.parse(q.body);
      r.status(201).json(
        await service.create(actor(r), wid(q), input.document),
      );
    }),
  );
  app.put(
    base + "/:packId",
    safe(async (q, r) => {
      limit(q, r);
      const input = z
        .object({ document: packDocumentSchema, baseRevisionId: uuid })
        .strict()
        .parse(q.body);
      r.json(
        await service.save(
          actor(r),
          wid(q),
          id(q),
          input.document,
          input.baseRevisionId,
        ),
      );
    }),
  );
  app.post(
    base + "/:packId/archive",
    safe(async (q, r) => {
      limit(q, r);
      z.object({})
        .strict()
        .parse(q.body ?? {});
      await service.archive(actor(r), wid(q), id(q));
      r.status(204).end();
    }),
  );
}
