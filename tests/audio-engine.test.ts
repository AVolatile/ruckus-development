import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioBus } from "../src/audio/AudioBus.js";
import { MusicController } from "../src/audio/MusicController.js";
import { AudioEngine } from "../src/audio/AudioEngine.js";
import { AudioPreloader, assets } from "../src/audio/AudioPreloader.js";
import { CueScheduler } from "../src/audio/CueScheduler.js";
import { DEFAULT_AUDIO_PREFERENCES as defaults } from "../src/audio/AudioPreferences.js";
import type { AudioState } from "../shared/audio.js";
class Param {
  value = 1;
  events: { target: number; at: number }[] = [];
  cancelAndHoldAtTime(_at: number) {}
  cancelScheduledValues(_at: number) {}
  setValueAtTime(value: number, at: number) {
    this.value = value;
    this.events.push({ target: value, at });
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.value = value;
    this.events.push({ target: value, at });
  }
}
class Node {
  links: unknown[] = [];
  disconnected = false;
  connect(node: unknown) {
    this.links.push(node);
  }
  disconnect() {
    this.disconnected = true;
    this.links = [];
  }
}
class Gain extends Node {
  gain = new Param();
}
class Source extends Node {
  buffer: unknown;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started: { at: number; offset: number }[] = [];
  stopped: number[] = [];
  start(at = 0, offset = 0) {
    this.started.push({ at, offset });
  }
  stop(at = 0) {
    this.stopped.push(at);
  }
}
class FakeAudio extends Node {
  state = "suspended";
  currentTime = 10;
  destination = new Node();
  onstatechange: (() => void) | null = null;
  sources: Source[] = [];
  gains: Gain[] = [];
  createGain() {
    const g = new Gain();
    this.gains.push(g);
    return g;
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(), {
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
    });
  }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
  async decodeAudioData(_bytes: ArrayBuffer) {
    return { duration: 8 };
  }
}
const cast = (fake: FakeAudio) => fake as unknown as AudioContext;
const frame = (patch: Partial<AudioState> = {}): AudioState => ({
  roomId: "audio-test",
  sequence: 0,
  names: ["LOBBY_ENTER"],
  occurredAt: 1000,
  phase: "lobby",
  phaseStartedAt: 1000,
  elapsedMs: 0,
  remainingMs: null,
  paused: false,
  profile: "hotwire",
  stage: "lobby",
  ...patch,
});
function loader() {
  return new AudioPreloader(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "audio/ogg" },
      }),
    () => {},
  );
}
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
test("master/music/SFX/UI topology, mute gains and stacked duck release preserve user volume", () => {
  const fake = new FakeAudio(),
    bus = new AudioBus(cast(fake));
  bus.apply(defaults, "host");
  assert.equal(fake.gains.length, 5);
  assert.equal((bus.master.gain as unknown as Param).value, 1);
  const original = (bus.music.gain as unknown as Param).value;
  const a = bus.duck(0.4),
    b = bus.duck(0.2);
  assert.equal((bus.musicDuck.gain as unknown as Param).value, 0.2);
  a();
  assert.equal((bus.musicDuck.gain as unknown as Param).value, 0.2);
  b();
  b();
  assert.equal((bus.musicDuck.gain as unknown as Param).value, 1);
  bus.pause(true);
  assert.equal((bus.musicDuck.gain as unknown as Param).value, 0.16);
  bus.pause(false);
  assert.equal((bus.music.gain as unknown as Param).value, original);
  bus.apply({ ...defaults, masterMuted: true }, "host");
  assert.equal((bus.master.gain as unknown as Param).value, 0);
  bus.dispose();
  assert.ok(fake.gains.every((g) => g.disconnected));
});
test("music restores phase offset once and crossfade stops/disconnects old sources", () => {
  const fake = new FakeAudio(),
    music = new MusicController(
      cast(fake),
      fake.destination as unknown as AudioNode,
    ),
    buffer = { duration: 8 } as AudioBuffer;
  music.play(assets.lobby, buffer, 11);
  assert.equal(fake.sources[0].started[0].offset, 3);
  assert.equal(music.play(assets.lobby, buffer, 0), false);
  music.play(assets.hotwire, buffer, 4);
  assert.ok(fake.sources[0].stopped[0] > fake.currentTime);
  assert.equal(music.count, 2);
  fake.sources[0].onended!();
  assert.equal(music.count, 1);
  assert.ok(fake.sources[0].disconnected);
  music.dispose();
  assert.equal(music.count, 0);
});
test("engine unlock, cue dedupe, independent buses, reconnect baseline and disposal", async () => {
  const fake = new FakeAudio(),
    engine = new AudioEngine(
      () => cast(fake),
      loader(),
      new CueScheduler(),
      () => 1050,
    );
  try {
    engine.configure("host", defaults);
    engine.sync(frame(), 1000, true);
    assert.equal(fake.sources.length, 0);
    await engine.unlock();
    assert.equal(engine.diagnostics().track, "lobby");
    const reveal = frame({
      stage: "reveal",
      phase: "results",
      sequence: 1,
      names: ["ANSWER_LOCKED", "REVEAL_ENTER"],
    });
    engine.sync(reveal, 1030);
    await settle();
    assert.equal(engine.diagnostics().oneShots, 1);
    engine.sync(reveal, 1040);
    await settle();
    assert.equal(engine.diagnostics().oneShots, 1);
    engine.configure("host", { ...defaults, musicEnabled: false });
    assert.equal(engine.diagnostics().track, null);
    engine.sync(
      frame({ sequence: 2, names: ["SEGMENT_INTRO_ENTER"], stage: "intro" }),
      1040,
    );
    await settle();
    assert.equal(engine.diagnostics().oneShots, 2);
    engine.configure("host", { ...defaults, sfxEnabled: false });
    await settle();
    assert.ok(engine.diagnostics().track);
    engine.disconnect();
    engine.sync(
      frame({ sequence: 3, names: ["REVEAL_ENTER"], stage: "reveal" }),
      1040,
      true,
    );
    await settle();
    assert.equal(engine.diagnostics().oneShots, 2);
    engine.release();
    assert.equal(engine.diagnostics().sources, 0);
    assert.equal(engine.diagnostics().loaded, 0);
  } finally {
    await engine.dispose();
  }
});
test("asset decode fallback, failed cache and release during decode do not retain stale buffers", async () => {
  let decodes = 0,
    fetches = 0;
  const fake = new FakeAudio();
  fake.decodeAudioData = async () => {
    decodes++;
    if (decodes === 1) throw Error("unsupported codec");
    return { duration: 8 };
  };
  const preloader = new AudioPreloader(
    async () => {
      fetches++;
      return new Response(new Uint8Array([1]), {
        headers: { "Content-Type": "audio/ogg" },
      });
    },
    () => {},
  );
  assert.ok(await preloader.load(cast(fake), "lobby"));
  assert.equal(decodes, 2);
  assert.equal(fetches, 2);
  const missing = new AudioPreloader(
    async () => {
      fetches++;
      return new Response("missing", { status: 404 });
    },
    () => {},
  );
  assert.equal(await missing.load(cast(fake), "hotwire"), null);
  const prior = fetches;
  assert.equal(await missing.load(cast(fake), "hotwire"), null);
  assert.equal(fetches, prior);
  preloader.clear();
  missing.clear();
  assert.equal(preloader.loaded, 0);
});
test("phones never start soundtrack loops and context failure remains a recoverable status", async () => {
  const fake = new FakeAudio(),
    engine = new AudioEngine(() => cast(fake), loader(), new CueScheduler());
  try {
    engine.configure("player", defaults);
    engine.sync(frame(), Date.now(), true);
    await engine.unlock();
    assert.equal(engine.diagnostics().track, null);
    await engine.feedback("select");
    assert.equal(engine.diagnostics().sources, 1);
    engine.configure("player", { ...defaults, playerEnabled: false });
    await engine.feedback("confirm");
    assert.equal(engine.diagnostics().status, "muted");
  } finally {
    await engine.dispose();
  }
  const blocked = new AudioEngine(
    () => {
      throw Error("Unavailable context");
    },
    loader(),
    new CueScheduler(),
  );
  try {
    await blocked.unlock();
    assert.equal(blocked.diagnostics().status, "error");
    blocked.sync(frame({ sequence: 2 }), 1000);
    assert.equal(blocked.diagnostics().status, "error");
  } finally {
    await blocked.dispose();
  }
});

test("countdown pulses once per remaining second and suppresses paused/reconnected stale ticks", async () => {
  let now = 1000;
  const fake = new FakeAudio(),
    engine = new AudioEngine(
      () => cast(fake),
      loader(),
      new CueScheduler(),
      () => now,
    );
  try {
    engine.configure("host", defaults);
    engine.sync(
      frame({
        stage: "gameplay",
        phase: "active",
        sequence: 1,
        names: ["QUESTION_OPEN"],
        remainingMs: 4900,
      }),
      1000,
      true,
    );
    await engine.unlock();
    await new Promise((r) => setTimeout(r, 130));
    assert.equal(engine.diagnostics().ticks, 1);
    engine.sync(
      frame({
        stage: "gameplay",
        phase: "active",
        sequence: 1,
        names: ["QUESTION_OPEN"],
        remainingMs: 4900,
      }),
      1000,
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(engine.diagnostics().ticks, 1);
    engine.sync(
      frame({
        stage: "gameplay",
        phase: "active",
        sequence: 1,
        names: ["QUESTION_OPEN"],
        remainingMs: 4900,
        paused: true,
      }),
      1000,
    );
    now += 1100;
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(engine.diagnostics().ticks, 1);
    engine.sync(
      frame({
        stage: "gameplay",
        phase: "active",
        sequence: 1,
        names: ["QUESTION_OPEN"],
        remainingMs: 3900,
      }),
      now,
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(engine.diagnostics().ticks, 2);
    engine.visibility(false);
    assert.equal(engine.diagnostics().track, null);
    engine.visibility(true);
    await settle();
    assert.equal(engine.diagnostics().track, "hotwire");
    assert.equal(engine.diagnostics().oneShots, 0);
  } finally {
    await engine.dispose();
  }
});
test("clearing during async decode prevents stale cache resurrection", async () => {
  let resolve: ((value: { duration: number }) => void) | undefined;
  const fake = new FakeAudio();
  fake.decodeAudioData = () =>
    new Promise((r) => {
      resolve = r;
    });
  const preloader = loader(),
    pending = preloader.load(cast(fake), "lobby");
  await settle();
  preloader.clear();
  resolve!({ duration: 8 });
  assert.equal(await pending, null);
  assert.equal(preloader.loaded, 0);
});
