import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { reliabilityDatabase } from "../tests/support/reliability-database.js";
import { Room } from "../server/engine.js";
import { EventRuntime } from "../server/events/runtime.js";
import { EventService } from "../server/events/service.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { emptyEvent } from "../shared/events.js";
import { user } from "../server/db/auth-schema.js";
import { personalWorkspace } from "../server/workspaces/policy.js";
import { HistoryOutbox } from "../server/history/outbox.js";
import { HistoryWorker } from "../server/history/worker.js";
import { SessionHistoryService } from "../server/history/service.js";
import { Readiness } from "../server/ops/readiness.js";
import { historyQuerySchema } from "../shared/history.js";
import { playRoom, roomSummary } from "../tests/support/history.js";
const database = await reliabilityDatabase(),
  { db, pool, url } = database;
const rooms: (Room | EventRuntime)[] = [];
const cpu = process.cpuUsage(),
  rss = process.memoryUsage().rss,
  start = performance.now();
const output: Record<string, unknown> = {};
const times = async (n: number, action: () => Promise<unknown>) => {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await action();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return {
    samples: n,
    medianMs: +samples[Math.floor(n / 2)].toFixed(2),
    p95Ms: +samples[Math.ceil(n * 0.95) - 1].toFixed(2),
  };
};
try {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    email: `capacity-${id}@example.test`,
    name: "Synthetic capacity fixture",
    emailVerified: true,
  });
  const wid = await personalWorkspace(db, id);
  for (let i = 0; i < 100; i++)
    rooms.push(
      new Room(
        String(i).padStart(5, "A"),
        DEFAULT_SETTINGS,
        "http://localhost",
        () => {},
      ),
    );
  for (let i = 0; i < 10; i++) {
    const r = new Room(
      `C${i}`.padStart(5, "A"),
      {
        ...DEFAULT_SETTINGS,
        playlist: ["room-temperature"],
        rounds: 1,
        autoAdvance: false,
      },
      "http://localhost",
      () => {},
    );
    rooms.push(r);
    for (let p = 0; p < 30; p++) r.join(`Guest ${p}`, p % 20, `${i}-${p}`);
    r.action("start");
    r.action("next");
  }
  const events = new EventService(db),
    definition = emptyEvent("Capacity sequence");
  definition.eventSettings.showEventIntro = false;
  definition.playlist = [
    {
      itemId: randomUUID(),
      type: "original",
      gameSlug: "room-temperature",
      enabled: true,
      order: 0,
      displayTitle: "",
      hostNote: "",
      transitionLabel: "",
      settings: { rounds: 1, pace: "quick", pack: "mixed" },
    },
  ];
  const event = await events.create(id, wid, definition);
  for (let i = 0; i < 5; i++) {
    const snapshot = await events.launch(id, wid, event.id, event.revisionId);
    const r = new EventRuntime(
      `E${i}`.padStart(5, "A"),
      snapshot,
      "http://localhost",
      () => {},
    );
    rooms.push(r);
    for (let p = 0; p < 30; p++)
      r.join(`Guest ${p}`, p % 20, `event-${i}-${p}`);
    r.command("start", r.sequence);
    r.command("advance", r.sequence);
    r.action("next");
  }
  output.rooms = {
    idle: 100,
    activeOriginals: 10,
    activeEvents: 5,
    guestEntries: 450,
    rssBefore: rss,
    rssAt115Rooms: process.memoryUsage().rss,
  };
  for (const r of rooms) r.dispose();
  rooms.length = 0;
  const source = playRoom("caption-this"),
    template = roomSummary(source, wid, id);
  source.dispose();
  const queue = new HistoryOutbox(db),
    history = new SessionHistoryService(db),
    recorded: string[] = [];
  const enqueueStart = performance.now();
  for (let i = 0; i < 40; i++) {
    const s = structuredClone(template),
      mapping = new Map(s.participants.map((p) => [p.id, randomUUID()]));
    s.id = randomUUID();
    for (const p of s.participants) p.id = mapping.get(p.id)!;
    for (const g of s.segments)
      for (const p of g.results)
        p.participantId = mapping.get(p.participantId)!;
    await queue.enqueue(s);
    recorded.push(s.id);
  }
  output.enqueue40Ms = +(performance.now() - enqueueStart).toFixed(2);
  let completed = 0;
  const materialization: number[] = [];
  const notify = () => {
    completed++;
    materialization.push(performance.now() - workerStart);
  };
  const workerStart = performance.now(),
    workers = [
      new HistoryWorker(queue, async () => true, notify, 2, 100),
      new HistoryWorker(queue, async () => true, notify, 2, 100),
    ];
  workers.forEach((w) => w.start());
  try {
    const deadline = Date.now() + 15000;
    while (completed < 40 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    if (completed !== 40) throw Error("Capacity backlog did not drain");
  } finally {
    await Promise.all(workers.map((w) => w.stop()));
  }
  output.materialization = {
    jobs: 40,
    workers: 2,
    concurrencyPerWorker: 2,
    drainMs: +(performance.now() - workerStart).toFixed(2),
    completionMedianMs: +materialization[20].toFixed(2),
    completionP95Ms: +materialization[37].toFixed(2),
  };
  const q = historyQuerySchema.parse({ range: "all" });
  output.historyList = await times(30, () => history.list(id, wid, q));
  output.historyDetail = await times(30, () =>
    history.get(id, wid, recorded[0]),
  );
  output.analytics = await times(30, () => history.analytics(id, wid, q));
  output.coldReadiness = await times(30, async () => {
    const r = new Readiness(url, () => false);
    try {
      if (!(await r.ready())) throw Error("Readiness failed");
    } finally {
      await r.close();
    }
  });
  output.pool = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
  output.queue = await queue.snapshot();
  output.rssAfterDisposal = process.memoryUsage().rss;
  output.cpuMicros = process.cpuUsage(cpu);
  output.elapsedMs = +(performance.now() - start).toFixed(2);
  await mkdir(".local/visual-qa/phase-6", { recursive: true });
  await writeFile(
    ".local/visual-qa/phase-6/capacity.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  rooms.forEach((r) => r.dispose());
  await database.close();
}
