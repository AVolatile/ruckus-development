import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod/v3";
import type { Database } from "../db/client.js";
import { historyQuerySchema } from "../../shared/history.js";
import { SessionHistoryService } from "../history/service.js";
export function installHistoryApi(app: Express, db: Database) {
  const service = new SessionHistoryService(db),
    base = "/api/v1/workspaces/:workspaceId";
  const safe =
    (fn: (q: Request, r: Response) => Promise<unknown>) =>
    (q: Request, r: Response, n: NextFunction) => {
      void fn(q, r).catch(n);
    };
  const wid = (q: Request) => z.string().uuid().parse(q.params.workspaceId);
  app.get(
    base + "/sessions",
    safe(async (q, r) =>
      r.json(
        await service.list(
          r.locals.user.id,
          wid(q),
          historyQuerySchema.parse(q.query),
        ),
      ),
    ),
  );
  app.get(
    base + "/sessions/:sessionId",
    safe(async (q, r) =>
      r.json(
        await service.get(
          r.locals.user.id,
          wid(q),
          z.string().uuid().parse(q.params.sessionId),
        ),
      ),
    ),
  );
  app.get(
    base + "/analytics/summary",
    safe(async (q, r) =>
      r.json(
        await service.analytics(
          r.locals.user.id,
          wid(q),
          historyQuerySchema.parse(q.query),
        ),
      ),
    ),
  );
  app.delete(
    base + "/sessions/:sessionId",
    safe(async (q, r) => {
      z.object({ confirm: z.literal("delete") })
        .strict()
        .parse(q.body);
      await service.delete(
        r.locals.user.id,
        wid(q),
        z.string().uuid().parse(q.params.sessionId),
        r.locals.requestId,
      );
      r.status(204).end();
    }),
  );
}
