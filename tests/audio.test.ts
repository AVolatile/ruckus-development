import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assetCatalog } from "../src/audio/assetCatalog.js";
import {
  CueScheduler,
  countdownSecond,
  phaseOffset,
} from "../src/audio/CueScheduler.js";
import {
  cueRegistry,
  trackForState,
  presentationEffects,
} from "../src/audio/CueRegistry.js";
import {
  normalizePreferences,
  preferenceKey,
  DEFAULT_AUDIO_PREFERENCES,
} from "../src/audio/AudioPreferences.js";
import {
  audioProfile,
  gameAudioProfiles,
} from "../src/audio/gameAudioProfiles.js";
import { Room } from "../server/engine.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { GAME_IDS } from "../shared/types.js";
import { newBoard } from "../shared/boards.js";
import type { AudioState } from "../shared/audio.js";
const state = (patch: Partial<AudioState> = {}): AudioState => ({
  roomId: "room-one",
  sequence: 1,
  names: ["QUESTION_OPEN"],
  occurredAt: 1000,
  phase: "active",
  phaseStartedAt: 1000,
  elapsedMs: 0,
  remainingMs: 15000,
  paused: false,
  profile: "hotwire",
  stage: "gameplay",
  ...patch,
});
test("cue registry covers every semantic name and keeps profiles presentation-only", () => {
  assert.equal(Object.keys(cueRegistry).length, 12);
  for (const game of GAME_IDS) assert.ok(gameAudioProfiles[game]);
  assert.equal(
    audioProfile("future-approved-profile"),
    gameAudioProfiles.studio,
  );
  assert.equal(trackForState(state()), "hotwire");
  assert.equal(
    trackForState(state({ profile: "studio-poll" })),
    "room-temperature",
  );
  assert.equal(audioProfile("studio-poll").tension, false);
  assert.equal(trackForState(state({ stage: "intermission" })), "intermission");
  assert.equal(
    presentationEffects(["FINAL_RESULTS_ENTER", "EVENT_LEADERBOARD_ENTER"])[0]
      .effect,
    "finale_sting",
  );
  assert.equal(
    presentationEffects(["REVEAL_ENTER", "ANSWER_LOCKED"])[0].effect,
    "reveal",
  );
});
test("room-scoped one-shot dedupe, fresh baseline and stale-cue policy survive remount", () => {
  const map = new Map<string, string>(),
    storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  const scheduler = new CueScheduler(storage);
  assert.deepEqual(scheduler.consume(state(), 0), []);
  const reveal = state({ sequence: 2, names: ["REVEAL_ENTER"] });
  assert.equal(scheduler.consume(reveal, 20).length, 1);
  assert.equal(scheduler.consume(reveal, 20).length, 0);
  assert.equal(new CueScheduler(storage).consume(reveal, 20).length, 0);
  assert.equal(
    scheduler.consume(
      state({ sequence: 3, names: ["SEGMENT_INTRO_ENTER"] }),
      2000,
    ).length,
    0,
  );
  assert.equal(
    scheduler.consume(
      state({ roomId: "new-room", sequence: 0, names: ["LOBBY_ENTER"] }),
      0,
    ).length,
    0,
  );
  assert.equal(
    scheduler.consume(
      state({ roomId: "new-room", sequence: 1, names: ["EVENT_START"] }),
      5,
    ).length,
    1,
  );
  scheduler.resetBaseline();
  assert.equal(
    scheduler.consume(
      state({ roomId: "new-room", sequence: 2, names: ["REVEAL_ENTER"] }),
      10,
    ).length,
    0,
  );
});
test("clock/phase offset and countdown thresholds use existing paused timing", () => {
  assert.equal(phaseOffset(state({ elapsedMs: 3400 }), 2000, 2400), 3.8);
  assert.equal(
    phaseOffset(state({ elapsedMs: 3400, paused: true }), 2000, 2400),
    3.4,
  );
  assert.equal(countdownSecond(5010, 20, false), 5);
  assert.equal(countdownSecond(2000, 10, true), null);
  assert.equal(countdownSecond(null, 20, false), null);
  assert.equal(countdownSecond(100, 101, false), 0);
});
test("audio preferences clamp persisted input, separate users/phones and tolerate old versions", () => {
  assert.deepEqual(
    normalizePreferences({ version: 99, masterMuted: true }),
    DEFAULT_AUDIO_PREFERENCES,
  );
  const p = normalizePreferences({
    version: 1,
    musicVolume: -5,
    sfxVolume: Infinity,
    musicEnabled: false,
    masterMuted: true,
  });
  assert.equal(p.musicVolume, 0);
  assert.equal(p.sfxVolume, 0.85);
  assert.equal(p.musicEnabled, false);
  assert.equal(p.masterMuted, true);
  assert.notEqual(preferenceKey("host", "alice"), preferenceKey("host", "bob"));
  assert.equal(
    preferenceKey("player", "alice"),
    preferenceKey("player", "bob"),
  );
});
test("all standalone engines and Studio modes expose safe monotonic authoritative cues", () => {
  for (const game of GAME_IDS) {
    const r = new Room(
      "ABCDE",
      { ...DEFAULT_SETTINGS, playlist: [game], rounds: 1, autoAdvance: false },
      "http://localhost/join",
      () => {},
    );
    try {
      r.addBots(2);
      const lobby = r.view().audio!;
      r.action("start");
      const intro = r.view().audio!;
      assert.ok(intro.sequence > lobby.sequence);
      assert.ok(intro.names.includes("EVENT_START"));
      r.action("next");
      const active = r.view().audio!;
      assert.equal(active.stage, "gameplay");
      assert.equal(active.profile, game);
      assert.ok(!JSON.stringify(active).includes("answer"));
      r.action("pause");
      assert.equal(r.view().audio!.paused, true);
      assert.equal(r.view().audio!.sequence, active.sequence);
      r.action("pause");
      assert.equal(r.view().audio!.paused, false);
      r.action("next");
      assert.ok(r.view().audio!.names.includes("REVEAL_ENTER"));
      r.action("next");
      assert.equal(r.view().audio!.stage, "finale");
      assert.equal(r.view().audio!.roomId, lobby.roomId);
      r.action("rematch");
      assert.ok(r.view().audio!.sequence > active.sequence);
    } finally {
      r.dispose();
    }
  }
  for (const poll of [false, true]) {
    const b = newBoard();
    b.title = "Audio Studio";
    b.questions[0] = {
      ...b.questions[0],
      prompt: "Choose a side",
      answers: ["Yes", "No"],
      type: poll ? "poll" : "multiple-choice",
      correctAnswer: poll ? null : 0,
      scoreMode: poll ? "no-score" : "casual",
    };
    const r = new Room(
      "ABCDE",
      {
        ...DEFAULT_SETTINGS,
        playlist: ["hotwire"],
        rounds: 1,
        autoAdvance: false,
      },
      "http://localhost/join",
      () => {},
      b,
    );
    try {
      r.addBots(2);
      r.action("start");
      r.action("next");
      assert.equal(r.view().audio!.profile, poll ? "studio-poll" : "studio");
    } finally {
      r.dispose();
    }
  }
});
test("committed asset hashes, provenance, loop bounds, MIME and audio budget validate", async () => {
  const { validateAudio } = await import("../scripts/validate-audio.mjs");
  const result = await validateAudio();
  assert.equal(result.assets, 27);
  assert.equal(result.files, 54);
  assert.ok(result.totalBytes < 6000000);
  const manifest = JSON.parse(
    await readFile(new URL("../audio/assets.json", import.meta.url), "utf8"),
  );
  const fields = [
    "id",
    "kind",
    "loop",
    "loopStart",
    "loopEnd",
    "duration",
    "formats",
  ];
  const runtime = Object.fromEntries(
    manifest.assets.map((asset: Record<string, unknown>) => [
      asset.id,
      Object.fromEntries(fields.map((field) => [field, asset[field]])),
    ]),
  );
  assert.deepEqual(assetCatalog, runtime);
});
