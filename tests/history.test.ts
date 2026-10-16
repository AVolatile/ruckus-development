import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Room } from "../server/engine.js";
import { EventRuntime } from "../server/events/runtime.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { GAME_IDS } from "../shared/types.js";
import { newBoard } from "../shared/boards.js";
import { emptyEvent, type LaunchSnapshot } from "../shared/events.js";
import {
  historyDates,
  historyQuerySchema,
  recapCsv,
  sessionSummarySchema,
} from "../shared/history.js";
import { SessionFinalizer } from "../server/history/finalizer.js";
import { playRoom, roomSummary } from "./support/history.js";
for (const game of GAME_IDS)
  test(`history captures ${game} outcomes without input artifacts or capabilities`, () => {
    const r = playRoom(game);
    try {
      const s = roomSummary(r);
      assert.ok(sessionSummarySchema.safeParse(s).success);
      assert.equal(s.segments[0].rounds, 1);
      assert.equal(s.segments[0].submissions, 2);
      assert.equal(
        s.segments[0].votes,
        ["sellout", "caption-this", "scribble-shift"].includes(game) ? 2 : 0,
      );
      const sorted = [...r.players.values()].sort(
        (a, b) => b.public.score - a.public.score,
      );
      assert.deepEqual(
        s.participants.map((p) => [p.name, p.finalScore, p.finalRank]),
        sorted.map((p, i) => [p.public.name, p.public.score, i + 1]),
      );
      const json = JSON.stringify(s);
      assert.ok(!json.includes("PRIVATE CREATIVE ARTIFACT"));
      for (const p of r.players.values()) {
        assert.ok(!json.includes(p.token));
        assert.ok(!json.includes(p.public.id));
      }
      assert.ok(!json.includes(r.hostToken));
      assert.ok(s.durationSeconds >= 0);
    } finally {
      r.dispose();
    }
  });
test("poll and no-score boards retain participation without standings", () => {
  for (const type of ["poll", "no-score"]) {
    const b = newBoard();
    b.title = "Opinion time";
    b.questions[0] = {
      ...b.questions[0],
      prompt: "Your pick?",
      answers: ["First", "Second"],
      type: type === "poll" ? "poll" : "multiple-choice",
      scoreMode: "no-score",
      correctAnswer: type === "poll" ? null : 0,
    };
    const r = playRoom("hotwire", b);
    try {
      const s = roomSummary(r);
      assert.ok(
        s.participants.every(
          (p) => p.finalScore === null && p.finalRank === null,
        ),
      );
      assert.equal(s.segments[0].scored, false);
      assert.equal(
        s.segments[0].results.reduce((n, p) => n + p.correct, 0),
        0,
      );
    } finally {
      r.dispose();
    }
  }
});
test("qualification, early termination, removed attendance, reconnect and rematch identity", () => {
  const r = new Room(
    "ABCDE",
    {
      ...DEFAULT_SETTINGS,
      playlist: ["hotwire"],
      rounds: 2,
      autoAdvance: false,
    },
    "http://localhost",
    () => {},
  );
  try {
    const a = r.join("A", 0, "a"),
      b = r.join("B", 1, "b");
    assert.equal(roomSummary(r), null);
    r.action("start");
    assert.equal(roomSummary(r), null);
    r.action("next");
    assert.equal(roomSummary(r), null);
    r.submit(a.id, { choice: 0 });
    r.action("next");
    r.disconnect("a");
    r.resumePlayer(a.token, "new-a");
    r.remove(b.id);
    r.action("end");
    const s = roomSummary(r);
    assert.equal(s.status, "ended_early");
    assert.equal(s.playerCountJoined, 2);
    assert.equal(s.playerCountCompleted, 0);
    assert.equal(s.participants.find((p) => p.name === "B")!.finalRank, null);
    const old = r.outcomes.runId;
    assert.equal(roomSummary(r).id, old);
    r.action("end");
    assert.equal(roomSummary(r).id, old);
  } finally {
    r.dispose();
  }
  const finished = playRoom();
  try {
    const id = finished.outcomes.runId;
    finished.action("rematch");
    assert.notEqual(finished.outcomes.runId, id);
    assert.equal(roomSummary(finished), null);
    assert.equal(finished.outcomes.joined, 2);
  } finally {
    finished.dispose();
  }
});
test("mixed Event freezes ordered source revisions and exact tied placement totals", () => {
  const d = emptyEvent("Frozen Event");
  d.eventSettings.showEventIntro = false;
  d.eventSettings.showFinalEventLeaderboard = false;
  d.eventSettings.showIntermissionBetweenGames = false;
  const b = newBoard();
  b.title = "Poll";
  b.questions[0] = {
    ...b.questions[0],
    prompt: "Pick",
    type: "poll",
    answers: ["Yes", "No"],
    correctAnswer: null,
    scoreMode: "no-score",
  };
  const snapshot: LaunchSnapshot = {
    id: randomUUID(),
    workspaceId: randomUUID(),
    launchedBy: randomUUID(),
    eventId: randomUUID(),
    eventRevisionId: randomUUID(),
    definition: d,
    brand: null,
    assets: { logo: null, background: null },
    segments: [0, 1].map((n) => ({
      itemId: randomUUID(),
      title: n ? "Poll" : "Original",
      transitionLabel: "",
      contentVersion: "test",
      settings: {
        ...DEFAULT_SETTINGS,
        playlist: [n ? "hotwire" : "room-temperature"],
        rounds: 1,
        autoAdvance: false,
      },
      ...(n
        ? { board: b, boardId: randomUUID(), boardRevisionId: randomUUID() }
        : {
            prompts: [{ title: "Choose", options: ["Yes", "No"], answer: 0 }],
            contentPack: {
              packId: randomUUID(),
              revisionId: randomUUID(),
              revisionNumber: 1,
              schemaVersion: 1,
              name: "Frozen pack",
              gameType: "room-temperature",
            },
          }),
    })),
  };
  const r = new EventRuntime("ABCDE", snapshot, "http://localhost", () => {});
  try {
    const a = r.join("First", 0, "a"),
      bb = r.join("Second", 1, "b");
    r.command("start", r.sequence);
    for (let i = 0; i < 2; i++) {
      r.command("advance", r.sequence);
      r.action("next");
      r.submit(a.id, { choice: 0 });
      r.submit(bb.id, { choice: 0 });
      if (r.view().phase === "active") r.action("next");
      r.action("next");
      r.command("advance", r.sequence);
    }
    assert.equal(r.state, "EVENT_FINAL");
    const s = r.historySummary()!;
    assert.equal(s.id, snapshot.id);
    assert.equal(s.source.eventRevisionId, snapshot.eventRevisionId);
    assert.deepEqual(
      s.segments.map((g) => g.sequence),
      [0, 1],
    );
    assert.equal(s.segments[0].source.packName, "Frozen pack");
    assert.equal(
      s.segments[1].source.boardRevisionId,
      snapshot.segments[1].boardRevisionId,
    );
    assert.equal(s.playerCountJoined, 2);
    assert.deepEqual(
      s.participants.map((p) => p.finalRank),
      [1, 1],
    );
    assert.deepEqual(
      s.participants.map((p) => p.finalScore),
      [1000, 1000],
    );
    assert.equal(s.segments[1].scored, false);
    const oldTitle = s.title;
    snapshot.definition.title = "Changed";
    assert.equal(r.historySummary()!.title, oldTitle);
  } finally {
    r.dispose();
  }
});
test("date ranges, bounded schemas, ordered results and safe CSV", () => {
  const q = historyQuerySchema.parse({ range: "7" });
  const range = historyDates(q, new Date("2026-10-16T12:00:00Z"));
  assert.equal(range.start!.toISOString(), "2026-10-10T00:00:00.000Z");
  assert.equal(
    historyDates(historyQuerySchema.parse({ range: "all" })).start,
    null,
  );
  assert.equal(
    historyDates(
      historyQuerySchema.parse({ range: "7", to: "2026-01-01" }),
      new Date("2026-10-16T12:00:00Z"),
    ).start!.toISOString(),
    "2025-12-26T00:00:00.000Z",
  );
  assert.equal(
    historyQuerySchema.safeParse({ from: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    historyQuerySchema.safeParse({ from: "2026-10-16", to: "2026-10-15" })
      .success,
    false,
  );
  assert.equal(historyQuerySchema.safeParse({ limit: 51 }).success, false);
  const r = playRoom();
  try {
    const s = roomSummary(r);
    s.participants[0].name = " =CMD()";
    assert.match(recapCsv(s), /' =CMD/);
    assert.equal(
      sessionSummarySchema.safeParse({ ...s, secret: "x" }).success,
      false,
    );
    assert.equal(
      sessionSummarySchema.safeParse({
        ...s,
        segments: [...s.segments, ...s.segments],
      }).success,
      false,
    );
  } finally {
    r.dispose();
  }
});
test("bounded async retries never delay a game finale and report failed durability honestly", async () => {
  const r = playRoom(),
    s = roomSummary(r);
  r.dispose();
  const states: string[] = [],
    logs: object[] = [];
  let attempts = 0;
  const writer = new SessionFinalizer(
    async () => {
      attempts++;
      throw new Error("secret DB URL");
    },
    [1, 1],
    (d) => {
      logs.push(d);
      throw new Error("logging sink unavailable");
    },
  );
  const task = writer.submit(s, (v) => states.push(v.status));
  assert.equal(r.phase, "final");
  assert.equal(states[0], "saving");
  await task;
  assert.equal(attempts, 3);
  assert.deepEqual(states, ["saving", "failed"]);
  assert.ok(!JSON.stringify(logs).includes("secret"));
  let n = 0;
  const success = new SessionFinalizer(
    async () => {
      if (++n === 1) throw Error();
    },
    [1],
    () => {},
  );
  const saved: string[] = [];
  await success.submit(s, (v) => saved.push(v.status));
  assert.deepEqual(saved, ["saving", "saved"]);
  await success.drain();
});

test("bounded details preserve truthful attendance and submission totals under roster turnover", () => {
  const b = newBoard();
  b.title = "Long poll";
  b.questions = Array.from({ length: 50 }, (_, order) => ({
    ...b.questions[0],
    id: randomUUID(),
    order,
    type: "poll" as const,
    scoreMode: "no-score" as const,
    prompt: "Choose",
    answers: ["Yes", "No"],
    correctAnswer: null,
  }));
  const r = new Room(
    "ABCDE",
    { ...DEFAULT_SETTINGS, playlist: ["hotwire"], autoAdvance: false },
    "http://localhost",
    () => {},
    b,
  );
  try {
    let ids = Array.from(
      { length: 7 },
      (_, n) => r.join(`Guest 0-${n}`, n, `socket-0-${n}`).id,
    );
    r.action("start");
    r.action("next");
    for (let round = 0; round < 50; round++) {
      for (const id of ids) r.submit(id, { choice: 0 });
      assert.equal(r.phase, "results");
      if (round < 49) {
        ids.forEach((id) => r.remove(id));
        ids = Array.from(
          { length: 7 },
          (_, n) =>
            r.join(`Guest ${round + 1}-${n}`, n, `socket-${round + 1}-${n}`).id,
        );
      }
      r.action("next");
    }
    const s = roomSummary(r);
    assert.equal(s.playerCountJoined, 350);
    assert.equal(s.participants.length, 300);
    assert.equal(s.detailsOmitted, 50);
    assert.equal(s.playerCountCompleted, 7);
    assert.equal(s.segments[0].participantCount, 350);
    assert.equal(s.segments[0].submissions, 350);
    assert.equal(s.segments[0].results.length, 300);
  } finally {
    r.dispose();
  }
});

test("delayed finalization cannot publish into a recycled code or leak to stale capabilities", async () => {
  const { broadcastRoom, retireRoom } = await import("../server/broadcast.js");
  const old = playRoom(),
    fresh = new Room(
      old.code,
      { ...DEFAULT_SETTINGS, playlist: ["hotwire"] },
      "http://localhost",
      () => {},
    );
  const joined = fresh.join("Current guest", 0, "current");
  const rooms = new Map([[old.code, old]]),
    received: import("../shared/types.js").RoomView[] = [];
  const channels = new Set([old.code]);
  const recipient: import("../server/broadcast.js").RoomSubscription = {
    leave: (code) => channels.delete(code),
    data: { identity: { code: old.code, role: "host", token: old.hostToken } },
    emit: (
      _event: "room:state",
      state: import("../shared/types.js").RoomView,
    ) => received.push(state),
  };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = new SessionFinalizer(
    () => pending,
    [],
    () => {},
  );
  const task = writer.submit(roomSummary(old), () =>
    broadcastRoom(rooms, [recipient], old),
  );
  old.dispose();
  retireRoom(rooms, [recipient], old);
  assert.equal(channels.has(old.code), false);
  assert.equal(recipient.data.identity, undefined);
  rooms.set(fresh.code, fresh);
  channels.add(fresh.code);
  received.length = 0;
  recipient.data.identity = {
    code: old.code,
    role: "host",
    token: old.hostToken,
  };
  // Even a current room may not send to an expired host/player capability.
  broadcastRoom(rooms, [recipient], fresh);
  assert.equal(received.length, 0);
  recipient.data.identity = {
    code: fresh.code,
    role: "player",
    token: randomUUID(),
  };
  broadcastRoom(rooms, [recipient], fresh);
  assert.equal(received.length, 0);
  recipient.data.identity = {
    code: fresh.code,
    role: "host",
    token: fresh.hostToken,
  };
  retireRoom(rooms, [recipient], old);
  assert.equal(
    rooms.get(fresh.code),
    fresh,
    "Stale cleanup removed a replacement room",
  );
  assert.equal(channels.has(fresh.code), true);
  release();
  await task;
  assert.equal(
    received.length,
    0,
    "Old completion callback leaked across room reuse",
  );
  broadcastRoom(rooms, [recipient], fresh);
  assert.equal(received.length, 1);
  assert.equal(received[0].players[0].name, "Current guest");
  recipient.data.identity = {
    code: fresh.code,
    role: "player",
    token: joined.token,
  };
  received.length = 0;
  broadcastRoom(rooms, [recipient], fresh);
  assert.equal(received[0].you, joined.id);
  fresh.dispose();
});
