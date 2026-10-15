import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod/v3";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { EventService } from "../events/service.js";
import { eventSnapshotAssets } from "../db/event-schema.js";
import {
  eventWriteSchema,
  eventTemplateSpecs,
  eventTemplate,
  type LaunchSnapshot,
} from "../../shared/events.js";
import type { Reply } from "../../shared/types.js";
import { randomUUID } from "node:crypto";
import { RateLimiter } from "../validation.js";
import { ApiError } from "./errors.js";
import { authorize } from "../workspaces/policy.js";
export interface EventAdapter {
  open: (snapshot: LaunchSnapshot, req: Request) => Reply;
  available: (snapshotId: string) => boolean;
  capacity: () => boolean;
}
const safe =
  (f: (q: Request, r: Response) => Promise<unknown>) =>
  (q: Request, r: Response, n: NextFunction) => {
    void f(q, r).catch(n);
  };
const uuid = z.string().uuid();
export function installEventAssets(
  app: Express,
  db: Database,
  adapter?: EventAdapter,
) {
  const limits = new RateLimiter();
  const sweep = setInterval(() => limits.sweep(), 60000);
  sweep.unref();
  app.get(
    "/api/v1/event-assets/:assetId",
    safe(async (q, r) => {
      if (!limits.allow(`asset:${q.ip}`, 180, 60000))
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Wait a moment before loading more images.",
        );
      const [a] = await db
        .select()
        .from(eventSnapshotAssets)
        .where(eq(eventSnapshotAssets.id, uuid.parse(q.params.assetId)));
      if (!a || !adapter?.available(a.snapshotId))
        throw new ApiError(
          404,
          "ASSET_NOT_FOUND",
          "That event image isn’t available.",
        );
      r.set({
        "Content-Type": a.mimeType,
        "Content-Length": String(a.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=0, must-revalidate",
        ETag: `"${a.contentHash}"`,
      });
      if (q.headers["if-none-match"] === `"${a.contentHash}"`)
        return r.status(304).end();
      r.end(a.binaryContent);
    }),
  );
}
export function installEventApi(
  app: Express,
  db: Database,
  adapter?: EventAdapter,
) {
  const service = new EventService(db),
    limits = new RateLimiter();
  const sweep = setInterval(() => limits.sweep(), 60000);
  sweep.unref();
  const base = "/api/v1/workspaces/:workspaceId/events",
    wid = (q: Request) => uuid.parse(q.params.workspaceId),
    id = (q: Request) => uuid.parse(q.params.eventId),
    actor = (r: Response) => String(r.locals.user.id);
  const limited = (q: Request, r: Response, kind: string, max: number) => {
    for (const key of [q.ip, actor(r)])
      if (!limits.allow(`${kind}:${key}`, max, 60000))
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Too many event requests. Wait a minute and try again.",
        );
  };
  app.get(
    base + "/templates",
    safe(async (q, r) => {
      await authorize(db, actor(r), wid(q), "events.read");
      r.json({ items: eventTemplateSpecs });
    }),
  );
  app.get(
    base,
    safe(async (q, r) => {
      let cursor;
      if (q.query.cursor) {
        try {
          cursor = z
            .object({ updatedAt: z.string().datetime(), id: uuid })
            .strict()
            .parse(
              JSON.parse(
                Buffer.from(
                  z.string().max(512).parse(q.query.cursor),
                  "base64url",
                ).toString(),
              ),
            );
        } catch {
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "Reload the event list to continue.",
          );
        }
      }
      r.json(await service.list(actor(r), wid(q), cursor));
    }),
  );
  app.post(
    base,
    safe(async (q, r) => {
      limited(q, r, "event-create", 20);
      const input = z
        .union([
          eventWriteSchema.omit({ baseRevisionId: true }),
          z
            .object({
              templateId: z.enum([
                "team-warmup",
                "friday-wind-down",
                "new-hire-mixer",
                "holiday-party",
                "company-trivia-night",
                "offsite-social",
              ]),
            })
            .strict(),
        ])
        .parse(q.body);
      const definition =
        "templateId" in input
          ? eventTemplate(input.templateId, randomUUID)
          : input.definition;
      r.status(201).json(await service.create(actor(r), wid(q), definition));
    }),
  );
  app.post(
    base + "/validate",
    safe(async (q, r) =>
      r.json(
        await service.validate(
          actor(r),
          wid(q),
          eventWriteSchema.omit({ baseRevisionId: true }).parse(q.body)
            .definition,
        ),
      ),
    ),
  );
  app.get(
    base + "/:eventId",
    safe(async (q, r) => r.json(await service.get(actor(r), wid(q), id(q)))),
  );
  app.put(
    base + "/:eventId",
    safe(async (q, r) => {
      const input = eventWriteSchema
        .extend({ baseRevisionId: uuid })
        .parse(q.body);
      r.json(
        await service.save(
          actor(r),
          wid(q),
          id(q),
          input.definition,
          input.baseRevisionId,
        ),
      );
    }),
  );
  app.post(
    base + "/:eventId/archive",
    safe(async (q, r) => {
      await service.archive(actor(r), wid(q), id(q));
      r.status(204).end();
    }),
  );
  app.post(
    base + "/:eventId/copy",
    safe(async (q, r) => {
      limited(q, r, "event-copy", 20);
      const { targetWorkspaceId } = z
        .object({ targetWorkspaceId: uuid })
        .strict()
        .parse(q.body);
      r.status(201).json(
        await service.copy(actor(r), wid(q), id(q), targetWorkspaceId),
      );
    }),
  );
  app.post(
    base + "/:eventId/launch",
    safe(async (q, r) => {
      limited(q, r, "event-launch", 8);
      if (!adapter?.capacity())
        throw new ApiError(
          503,
          "STAGE_UNAVAILABLE",
          "All stages are occupied. Try again shortly.",
        );
      const { baseRevisionId } = z
        .object({ baseRevisionId: uuid })
        .strict()
        .parse(q.body);
      const snapshot = await service.launch(
        actor(r),
        wid(q),
        id(q),
        baseRevisionId,
      );
      r.status(201).json(adapter.open(snapshot, q));
    }),
  );
}
