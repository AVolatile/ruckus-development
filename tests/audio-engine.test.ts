import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioBus } from "../src/audio/AudioBus.js";
import {
  MUSIC_CROSSFADE_MS,
  MUSIC_STOP_GRACE_MS,
  MusicController,
} from "../src/audio/MusicController.js";
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

test("failed retirement cannot leave a started unowned bed behind", () => {
  const fake = new FakeAudio();
  const music = new MusicController(
    cast(fake),
    fake.destination as unknown as AudioNode,
  );
  const buffer = { duration: 8 } as AudioBuffer;
  music.play(assets.hotwire, buffer, 0);
  fake.gains[0].gain.linearRampToValueAtTime = () => {
    throw new Error("Interrupted gain automation");
  };
  assert.throws(() => music.play(assets["caption-this"], buffer, 0));
  music.dispose();
  const leaked = fake.sources.filter(
    (source) => source.started.length > 0 && !source.disconnected,
  );
  assert.equal(
    leaked.length,
    0,
    "every started loop must remain owned and disposable after a failed transition",
  );
});

const gameplay = (profile: AudioState["profile"], sequence = 1) =>
  frame({
    profile,
    sequence,
    stage: "gameplay",
    phase: "active",
    names: ["QUESTION_OPEN"],
  });
for (const [from, to] of [
  ["hotwire", "caption-this"],
  ["hotwire", "sellout"],
  ["hotwire", "scribble-shift"],
  ["hotwire", "room-temperature"],
  ["caption-this", "hotwire"],
  ["scribble-shift", "hotwire"],
] as const) {
  test(`one owned bed through ${from} → ${to}, including repeated snapshots`, async () => {
    const fake = new FakeAudio();
    const engine = new AudioEngine(
      () => cast(fake),
      loader(),
      new CueScheduler(),
    );
    try {
      engine.configure("host", { ...defaults, sfxEnabled: false });
      engine.sync(gameplay(from), 1000, true);
      await engine.unlock();
      engine.sync(gameplay(to, 2), 1000);
      await settle();
      assert.equal(engine.diagnostics().track, to);
      assert.equal(engine.diagnostics().musicCurrent, 1);
      assert.equal(engine.diagnostics().musicRetiring, 1);
      assert.equal(fake.sources.filter((s) => !s.disconnected).length, 2);
      fake.sources[0].onended!();
      assert.equal(engine.diagnostics().musicRetiring, 0);
      assert.equal(engine.diagnostics().sources, 1);
      assert.ok(fake.sources[0].disconnected);
      for (let i = 0; i < 5; i++) engine.sync(gameplay(to, 2), 1000);
      await settle();
      assert.equal(fake.sources.length, 2);
      assert.equal(engine.diagnostics().musicCurrent, 1);
    } finally {
      await engine.dispose();
    }
    assert.ok(fake.sources.every((s) => s.disconnected));
  });
}
test("retirement deadline clears sources and gains even without an ended callback", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fake = new FakeAudio();
  const music = new MusicController(
    cast(fake),
    fake.destination as unknown as AudioNode,
  );
  const buffer = { duration: 8 } as AudioBuffer;
  music.play(assets.hotwire, buffer, 0);
  music.play(assets["caption-this"], buffer, 0);
  assert.equal(music.retiringCount, 1);
  t.mock.timers.tick(MUSIC_CROSSFADE_MS + MUSIC_STOP_GRACE_MS);
  assert.equal(music.retiringCount, 0);
  assert.equal(music.currentCount, 1);
  assert.ok(fake.sources[0].disconnected && fake.gains[0].disconnected);
  music.play(assets.sellout, buffer, 0);
  music.play(assets["scribble-shift"], buffer, 0);
  assert.equal(music.count, 2);
  assert.equal(music.retiringCount, 1);
  t.mock.timers.tick(MUSIC_CROSSFADE_MS + MUSIC_STOP_GRACE_MS);
  assert.equal(music.count, 1);
  music.dispose();
  assert.ok(fake.sources.every((s) => s.disconnected));
});
function delayedLoader() {
  const preloader = loader();
  const jobs: { id: string; resolve: (buffer: AudioBuffer | null) => void }[] =
    [];
  preloader.load = (_context, id) =>
    new Promise((resolve) => jobs.push({ id, resolve }));
  return {
    preloader,
    jobs,
    resolve(id: string, value = { duration: 8 } as AudioBuffer) {
      const job = jobs.find((j) => j.id === id);
      assert.ok(job, `pending ${id}`);
      jobs.splice(jobs.indexOf(job), 1);
      job.resolve(value);
    },
  };
}
test("A → B → C delayed loads cannot resurrect B, including a late fallback", async () => {
  const fake = new FakeAudio(),
    pending = delayedLoader();
  const engine = new AudioEngine(
    () => cast(fake),
    pending.preloader,
    new CueScheduler(),
  );
  try {
    engine.configure("host", { ...defaults, sfxEnabled: false });
    engine.sync(gameplay("hotwire"), 1000, true);
    const unlocked = engine.unlock();
    await settle();
    pending.resolve("hotwire");
    await unlocked;
    engine.sync(gameplay("caption-this", 2), 1000);
    pending.resolve("caption-this", null as unknown as AudioBuffer);
    await settle(); // B is waiting for its fallback while C becomes authoritative.
    engine.sync(gameplay("scribble-shift", 3), 1000);
    pending.resolve("scribble-shift");
    await settle();
    assert.equal(engine.diagnostics().track, "scribble-shift");
    const sources = fake.sources.length;
    pending.resolve("studio");
    await settle();
    assert.equal(engine.diagnostics().track, "scribble-shift");
    assert.equal(fake.sources.length, sources);
    fake.sources[0].onended!();
    assert.equal(engine.diagnostics().sources, 1);
    engine.sync(gameplay("hotwire", 1), 1000); // Older resumed metadata is ignored.
    await settle();
    assert.equal(engine.diagnostics().track, "scribble-shift");
  } finally {
    await engine.dispose();
  }
});
test("late creative decode cannot restart music after end or room release", async () => {
  for (const end of [true, false]) {
    const fake = new FakeAudio(),
      pending = delayedLoader();
    const engine = new AudioEngine(
      () => cast(fake),
      pending.preloader,
      new CueScheduler(),
    );
    try {
      engine.configure("host", { ...defaults, sfxEnabled: false });
      engine.sync(gameplay("caption-this"), 1000, true);
      const unlocked = engine.unlock();
      await settle();
      if (end)
        engine.sync(
          frame({ sequence: 2, stage: "ended", names: ["EVENT_END"] }),
          1000,
        );
      else engine.release();
      pending.resolve("caption-this");
      await unlocked;
      assert.equal(engine.diagnostics().track, null);
      assert.equal(fake.sources.length, 0);
    } finally {
      await engine.dispose();
    }
  }
});
test("creative reconnect baseline and pause/resume retain only the correct bed", async () => {
  const fake = new FakeAudio();
  const engine = new AudioEngine(
    () => cast(fake),
    loader(),
    new CueScheduler(),
  );
  try {
    engine.configure("host", { ...defaults, sfxEnabled: false });
    engine.sync(gameplay("caption-this"), 1000, true);
    await engine.unlock();
    engine.sync({ ...gameplay("caption-this"), paused: true }, 1000);
    engine.sync(gameplay("caption-this"), 1000);
    await settle();
    assert.equal(fake.sources.length, 1);
    engine.disconnect();
    engine.sync(
      { ...gameplay("scribble-shift", 3), elapsedMs: 4200 },
      5200,
      true,
    );
    await settle();
    assert.equal(engine.diagnostics().track, "scribble-shift");
    assert.equal(engine.diagnostics().musicCurrent, 1);
    assert.equal(engine.diagnostics().musicRetiring, 0);
    assert.equal(engine.diagnostics().oneShots, 0);
    assert.ok(fake.sources[0].disconnected);
    assert.ok(fake.sources[1].started[0].offset >= 4.2);
  } finally {
    await engine.dispose();
  }
});

test("C becomes current before B finishes decoding and B never starts", async () => {
  const fake = new FakeAudio(),
    pending = delayedLoader();
  const engine = new AudioEngine(
    () => cast(fake),
    pending.preloader,
    new CueScheduler(),
  );
  try {
    engine.configure("host", { ...defaults, sfxEnabled: false });
    engine.sync(gameplay("hotwire"), 1000, true);
    const unlocked = engine.unlock();
    await settle();
    pending.resolve("hotwire");
    await unlocked;
    engine.sync(gameplay("caption-this", 2), 1000);
    engine.sync(gameplay("sellout", 3), 1000);
    pending.resolve("sellout");
    await settle();
    const count = fake.sources.length;
    pending.resolve("caption-this");
    await settle();
    assert.equal(engine.diagnostics().track, "sellout");
    assert.equal(engine.diagnostics().requestedTrack, "sellout");
    assert.equal(fake.sources.length, count);
    fake.sources[0].onended!();
    assert.equal(engine.diagnostics().sources, 1);
  } finally {
    await engine.dispose();
  }
});

test("engine surfaces a failed transition, cleans native voices and retries without orphan loops", async () => {
  const fake = new FakeAudio();
  const engine = new AudioEngine(
    () => cast(fake),
    loader(),
    new CueScheduler(),
  );
  try {
    engine.configure("host", { ...defaults, sfxEnabled: false });
    engine.sync(gameplay("hotwire"), 1000, true);
    await engine.unlock();
    const voiceGain = fake.gains.at(-1)!;
    voiceGain.gain.linearRampToValueAtTime = () => {
      throw new Error("Interrupted retirement");
    };
    engine.sync(gameplay("caption-this", 2), 1000);
    await settle();
    assert.equal(engine.diagnostics().status, "error");
    assert.equal(engine.diagnostics().musicCurrent, 0);
    assert.equal(engine.diagnostics().musicRetiring, 0);
    assert.ok(fake.sources.every((s) => s.disconnected));
    await engine.unlock();
    assert.equal(engine.diagnostics().status, "ready");
    assert.equal(engine.diagnostics().track, "caption-this");
    assert.equal(
      fake.sources.filter((s) => s.started.length && !s.disconnected).length,
      1,
    );
  } finally {
    await engine.dispose();
  }
});

test("unavailable creative bed and neutral fallback fade out the prior trivia bed", async () => {
  const fake = new FakeAudio(),
    preloader = loader();
  const load = preloader.load.bind(preloader);
  preloader.load = (context, id) =>
    ["caption-this", "studio"].includes(id)
      ? Promise.resolve(null)
      : load(context, id);
  const engine = new AudioEngine(
    () => cast(fake),
    preloader,
    new CueScheduler(),
  );
  try {
    engine.configure("host", { ...defaults, sfxEnabled: false });
    engine.sync(gameplay("hotwire"), 1000, true);
    await engine.unlock();
    engine.sync(gameplay("caption-this", 2), 1000);
    await settle();
    assert.equal(engine.diagnostics().track, null);
    assert.equal(engine.diagnostics().musicCurrent, 0);
    fake.sources[0].onended!();
    assert.equal(engine.diagnostics().musicRetiring, 0);
    assert.ok(fake.sources[0].disconnected);
  } finally {
    await engine.dispose();
  }
});

test("incoming preparation failure also releases the previous profile", async () => {
  const fake = new FakeAudio();
  const engine = new AudioEngine(
    () => cast(fake),
    loader(),
    new CueScheduler(),
  );
  try {
    engine.configure("host", { ...defaults, sfxEnabled: false });
    engine.sync(gameplay("hotwire"), 1000, true);
    await engine.unlock();
    fake.createGain = () => {
      throw new Error("Cannot allocate incoming gain");
    };
    engine.sync(gameplay("caption-this", 2), 1000);
    await settle();
    assert.equal(engine.diagnostics().status, "error");
    assert.equal(engine.diagnostics().track, null);
    assert.equal(engine.diagnostics().sources, 0);
    assert.ok(fake.sources.every((s) => s.disconnected));
  } finally {
    await engine.dispose();
  }
});
