import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  eventDefinitionSchema,
  emptyEvent,
  eventTemplate,
  eventTemplateSpecs,
  placementPoints,
  type LaunchSnapshot,
} from "../shared/events.js";
import { EventRuntime } from "../server/events/runtime.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { GAME_IDS, type Input } from "../shared/types.js";
import { getPrompt } from "../server/content.js";
import { newBoard } from "../shared/boards.js";
import { eventHash } from "../server/events/service.js";
function snapshot(): LaunchSnapshot {
  const d = eventTemplate("friday-wind-down", randomUUID);
  return {
    id: randomUUID(),
    eventId: randomUUID(),
    eventRevisionId: randomUUID(),
    workspaceId: randomUUID(),
    launchedBy: randomUUID(),
    definition: d,
    brand: null,
    assets: { logo: null, background: null },
    segments: GAME_IDS.map((game, index) => ({
      itemId: d.playlist[index]?.itemId ?? randomUUID(),
      title: game,
      transitionLabel: "",
      contentVersion: "test",
      settings: {
        ...DEFAULT_SETTINGS,
        playlist: [game],
        rounds: 1,
        autoAdvance: false,
      },
      prompts: [getPrompt(game, 0, "mixed", 0)],
    })),
  };
}
function next(
  r: EventRuntime,
  action: "start" | "advance" | "skip-next" | "end" = "advance",
) {
  r.command(action, r.sequence);
}
test("event definitions bound and validate stable ordering; real templates are independent", () => {
  const d = emptyEvent();
  assert.equal(eventDefinitionSchema.safeParse(d).success, true);
  assert.equal(eventHash(d), eventHash({ ...d }));
  for (const t of eventTemplateSpecs) {
    const a = eventTemplate(t.id, randomUUID),
      b = eventTemplate(t.id, randomUUID);
    assert.ok(eventDefinitionSchema.safeParse(a).success);
    assert.notEqual(a.playlist[0].itemId, b.playlist[0].itemId);
  }
  const a = eventTemplate("team-warmup", randomUUID);
  a.playlist[1].itemId = a.playlist[0].itemId;
  assert.equal(eventDefinitionSchema.safeParse(a).success, false);
  a.playlist = Array.from({ length: 51 }, (_, order) => ({
    ...a.playlist[0],
    itemId: randomUUID(),
    order,
  }));
  assert.equal(eventDefinitionSchema.safeParse(a).success, false);
});
test("event placement points preserve equal placements and deterministic extremes", () => {
  assert.deepEqual(
    placementPoints([
      { id: "a", score: 900 },
      { id: "b", score: 900 },
      { id: "c", score: 0 },
    ]),
    [
      { playerId: "a", points: 1000 },
      { playerId: "b", points: 1000 },
      { playerId: "c", points: 0 },
    ],
  );
  assert.equal(placementPoints([{ id: "solo", score: 20 }])[0].points, 1000);
  assert.deepEqual(placementPoints([]), []);
});
test("one event plays all six Originals and Studio with identity, scoring, cues and reconnect intact", () => {
  const s = snapshot(),
    board = newBoard();
  board.title = "Holiday questions";
  board.questions[0] = {
    ...board.questions[0],
    prompt: "Choose yes",
    answers: ["Yes", "No"],
    correctAnswer: 0,
  };
  s.segments.splice(1, 0, {
    itemId: randomUUID(),
    title: board.title,
    transitionLabel: "",
    contentVersion: "studio-v1",
    board,
    settings: {
      ...DEFAULT_SETTINGS,
      playlist: ["hotwire"],
      rounds: 1,
      autoAdvance: false,
    },
  });
  const r = new EventRuntime("ABCDE", s, "http://localhost/join", () => {});
  try {
    const a = r.join("Player One", 0, "one"),
      b = r.join("Player Two", 1, "two");
    r.connectHost("host");
    const identity = a.token;
    next(r, "start");
    assert.ok(r.view().event!.cue.names.includes("EVENT_START"));
    assert.throws(() => r.command("advance", 0), /moved on/);
    next(r);
    assert.equal(r.state, "SEGMENT_INTRO");
    for (let index = 0; index < s.segments.length; index++) {
      assert.equal(r.segmentIndex, index);
      assert.equal(r.playerByToken(identity)?.public.id, a.id);
      next(r);
      assert.equal(r.state, "GAME_ACTIVE");
      r.action("next");
      assert.equal(r.view().phase, "active");
      assert.equal(r.view(a.id).prompt?.explanation, undefined);
      assert.deepEqual(r.view(a.id).correct, []);
      assert.equal(r.view(a.id).event?.hostNote, undefined);
      const game = s.segments[index].settings.playlist[0];
      if (
        index === 1 ||
        ["hotwire", "room-temperature", "odd-one-in"].includes(game)
      ) {
        r.submit(a.id, { choice: 0 });
        r.submit(b.id, { choice: 1 });
        if (r.view().phase === "active") r.action("next");
      } else {
        const input = (name: string): Input =>
          game === "scribble-shift"
            ? {
                drawing: [
                  {
                    color: "#191a24",
                    width: 3,
                    points: [
                      [0, 0],
                      [1, 1],
                    ],
                  },
                ],
              }
            : { text: name + " creative entry" };
        r.submit(a.id, input("First"));
        r.submit(b.id, input("Second"));
        r.action("next");
        assert.equal(r.view().phase, "voting");
        const av = r.view(a.id),
          bv = r.view(b.id);
        r.submit(a.id, { vote: bv.ownEntryId! });
        r.submit(b.id, { vote: av.ownEntryId! });
        r.action("next");
      }
      assert.equal(r.view().phase, "results");
      assert.ok(r.view().event!.cue.names.includes("REVEAL_ENTER"));
      r.action("next");
      assert.equal(r.state, "GAME_RESULTS");
      r.disconnect(index === 0 ? "one" : "rejoined");
      r.resumePlayer(identity, "rejoined");
      assert.equal(r.playerByToken(identity)?.public.id, a.id);
      if (index < s.segments.length - 1) {
        next(r);
        assert.equal(r.state, "INTERMISSION");
        assert.throws(() => r.submit(a.id, { choice: 0 }), /host will start/);
        next(r);
      } else {
        next(r);
        assert.equal(r.state, "EVENT_FINAL");
        assert.equal(
          r.view().event!.scores.find((p) => p.playerId === a.id)!.segments,
          7,
        );
      }
    }
    assert.equal(r.view().code, "ABCDE");
    assert.ok(r.view().event!.scores.every((p) => p.points >= 0));
    assert.throws(() => next(r), /current game controls/);
  } finally {
    r.dispose();
  }
});
test("event late joins, skipping, disabled aggregate, immutable runtime copy and teardown", () => {
  const s = snapshot();
  s.definition.eventSettings.allowLateJoin = false;
  s.definition.eventSettings.carryScoresAcrossGames = false;
  let ended = 0;
  const r = new EventRuntime(
    "ABCDE",
    s,
    "http://localhost/join",
    () => {},
    () => ended++,
  );
  try {
    r.addBots(2);
    next(r, "start");
    s.definition.title = "Mutated source";
    assert.notEqual(r.view().event!.title, s.definition.title);
    assert.throws(() => r.join("Late player", 2, "late"), /underway/);
    next(r);
    next(r, "skip-next");
    assert.equal(r.view().event!.playlist[1].skipped, true);
    assert.throws(() => r.action("rematch"), /event progression/);
    next(r, "end");
    assert.equal(r.state, "ENDED");
    assert.equal(ended, 1);
    r.action("end");
    assert.equal(ended, 1);
  } finally {
    r.dispose();
  }
});

test("a failed next-segment initializer retains the audience and exposes safe host recovery", () => {
  const r = new EventRuntime(
    "ABCDE",
    snapshot(),
    "http://localhost/join",
    () => {},
  );
  try {
    const player = r.join("First guest", 0, "one");
    r.join("Second guest", 1, "two");
    next(r, "start");
    next(r);
    next(r);
    r.action("next");
    r.action("next");
    r.action("next");
    next(r);
    assert.equal(r.state, "INTERMISSION");
    const boundary = r as unknown as {
      makeRoom: (index: number) => import("../server/engine.js").Room;
    };
    const original = boundary.makeRoom.bind(r);
    boundary.makeRoom = () => {
      throw new Error("Private implementation detail");
    };
    assert.throws(() => next(r), /Reference/);
    assert.equal(r.state, "INTERMISSION");
    assert.equal(r.playerByToken(player.token)!.public.id, player.id);
    assert.match(r.view().event!.problem!.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(r.view(player.id).event!.problem, undefined);
    assert.ok(
      !JSON.stringify(r.view()).includes("Private implementation detail"),
    );
    boundary.makeRoom = original;
    next(r, "skip-next");
    next(r);
    assert.equal(r.segmentIndex, 2);
    assert.equal(r.state, "SEGMENT_INTRO");
    assert.equal(r.view().event!.problem, undefined);
  } finally {
    r.dispose();
  }
});
