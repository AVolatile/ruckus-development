import { AudioBus } from "./AudioBus";
import { AudioPreloader, assets } from "./AudioPreloader";
import { MusicController } from "./MusicController";
import { SfxController } from "./SfxController";
import {
  CueScheduler,
  safeCursorStorage,
  countdownSecond,
  phaseOffset,
} from "./CueScheduler";
import { trackForState } from "./CueRegistry";
import { audioProfile } from "./gameAudioProfiles";
import { DEFAULT_AUDIO_PREFERENCES } from "./AudioPreferences";
import type {
  AudioState,
  AudioRole,
  AudioPreferences,
  AudioDiagnostics,
  FeedbackKind,
} from "./types";
export class AudioEngine {
  private context: AudioContext | null = null;
  private bus: AudioBus | null = null;
  private music: MusicController | null = null;
  private sfx: SfxController | null = null;
  private ui: SfxController | null = null;
  private loader: AudioPreloader;
  private scheduler: CueScheduler;
  private prefs = { ...DEFAULT_AUDIO_PREFERENCES };
  private role: AudioRole = "host";
  private latest: {
    state: AudioState;
    receivedAt: number;
    serverTime: number;
  } | null = null;
  private visible = true;
  private live = false;
  private generation = 0;
  private unlockPending: Promise<void> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private releases = new Set<() => void>();
  private lastTick = "";
  private feedbackAt = new Map<FeedbackKind, number>();
  private reconcileId = 0;
  private listeners = new Set<() => void>();
  private status: AudioDiagnostics["status"] = "uninitialized";
  private error: string | null = null;
  private counts = { oneShots: 0, skipped: 0, ticks: 0 };
  constructor(
    private factory: () => AudioContext = () => {
      const AudioContextConstructor =
        globalThis.AudioContext ||
        (globalThis as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio unavailable");
      return new AudioContextConstructor({ latencyHint: "interactive" });
    },
    loader = new AudioPreloader(),
    scheduler = new CueScheduler(safeCursorStorage()),
    private now: () => number = () => Date.now(),
  ) {
    this.loader = loader;
    this.scheduler = scheduler;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
  diagnostics(): AudioDiagnostics {
    return {
      status: this.muted() ? "muted" : this.status,
      contextState: this.context?.state ?? "uninitialized",
      track: this.music?.track ?? null,
      profile: this.latest?.state.profile ?? null,
      stage: this.latest?.state.stage ?? null,
      cue: this.latest?.state.names.join("+") ?? null,
      sequence: this.latest?.state.sequence ?? -1,
      loaded: this.loader.loaded,
      sources:
        (this.music?.count ?? 0) +
        (this.sfx?.count ?? 0) +
        (this.ui?.count ?? 0),
      ...this.counts,
      error: this.error,
    };
  }
  configure(role: AudioRole, prefs: AudioPreferences) {
    const changed = this.role !== role;
    this.role = role;
    this.prefs = prefs;
    if (changed) this.release();
    this.bus?.apply(prefs, role, this.visible && this.live);
    if (role === "player" || !prefs.musicEnabled || prefs.masterMuted)
      this.music?.stop();
    if (!prefs.sfxEnabled || prefs.masterMuted) {
      this.sfx?.dispose();
      this.ui?.dispose();
    }
    if (this.live) void this.reconcile();
    this.notify();
  }
  private muted() {
    return (
      this.prefs.masterMuted ||
      (this.role === "player"
        ? !this.prefs.playerEnabled
        : !this.prefs.musicEnabled && !this.prefs.sfxEnabled)
    );
  }
  async unlock() {
    if (this.muted()) return;
    if (this.context?.state === "running" && this.status === "ready") return;
    if (this.unlockPending) return this.unlockPending;
    this.unlockPending = (async () => {
      try {
        if (!this.context) {
          this.context = this.factory();
          this.bus = new AudioBus(this.context);
          this.music = new MusicController(this.context, this.bus.music, () =>
            this.notify(),
          );
          this.sfx = new SfxController(this.context, this.bus.sfx, () =>
            this.notify(),
          );
          this.ui = new SfxController(this.context, this.bus.ui, () =>
            this.notify(),
          );
          this.context.onstatechange = () => {
            if (
              this.context?.state === "suspended" &&
              this.live &&
              this.visible
            )
              this.status = "suspended";
            this.notify();
          };
        }
        await this.context.resume();
        if (this.context.state !== "running")
          throw new Error("Audio remains suspended");
        this.status = "ready";
        this.error = null;
        this.bus!.apply(this.prefs, this.role, this.live && this.visible);
        await this.reconcile();
      } catch {
        this.status = "error";
        this.error =
          "Sound is unavailable. The game is ready to play; try Enable sound again.";
      } finally {
        this.unlockPending = null;
        this.notify();
      }
    })();
    return this.unlockPending;
  }
  sync(state: AudioState, serverTime: number, baseline = false) {
    const previous = this.latest?.state;
    if (previous?.roomId !== state.roomId) {
      this.generation++;
      this.music?.dispose();
      this.sfx?.dispose();
      this.ui?.dispose();
      this.cancelTimers();
      this.counts = { oneShots: 0, skipped: 0, ticks: 0 };
      this.lastTick = "";
    }
    this.live = true;
    if (!this.context && this.status !== "error") this.status = "locked";
    this.latest = { state, serverTime, receivedAt: this.now() };
    this.bus?.apply(this.prefs, this.role, this.visible);
    this.bus?.pause(state.paused);
    const age = Math.max(0, serverTime - state.occurredAt);
    const cues = this.scheduler.consume(state, age, baseline);
    if (
      this.role === "host" &&
      this.context &&
      !this.muted() &&
      this.prefs.sfxEnabled &&
      !baseline &&
      this.visible
    ) {
      for (const cue of cues)
        void this.effect(cue.effect!, state, age, cue.lateMs, cue.duck);
    }
    if (state.paused)
      this.lastTick = `${state.roomId}:${state.phaseStartedAt}:${Math.ceil((state.remainingMs ?? 0) / 1000)}`;
    if (!this.tickTimer && state.stage !== "ended")
      this.tickTimer = setInterval(() => this.tick(), 100);
    if (state.stage === "ended") {
      this.cancelTimers();
      this.music?.stop(350);
      const generation = this.generation;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (generation === this.generation) this.release();
      }, 1600);
      this.timers.add(timer);
    } else void this.reconcile();
    this.warm();
    this.notify();
  }
  private warm() {
    if (!this.live || this.muted()) return;
    const state = this.latest?.state;
    if (!state || state.stage === "ended") return;
    const byStage: Record<string, string[]> = {
      lobby: ["lobby", "event_start", "intro", "segment_intro"],
      intro: ["intro", "segment_intro", "lock", "reveal"],
      gameplay: ["lock", "reveal", "results", "tick_soft", "tick_urgent"],
      voting: ["reveal", "results"],
      reveal: [
        "results",
        "leaderboard_sting",
        "leaderboard",
        "intermission",
        "finale_sting",
      ],
      leaderboard: [
        "leaderboard",
        "intermission",
        "segment_intro",
        "finale_sting",
        "finale",
      ],
      results: ["results", "segment_intro", "finale"],
      intermission: ["intermission", "segment_intro", "intro"],
      finale: ["finale", "end"],
    };
    const ids =
      this.role === "player"
        ? ["select", "confirm", "vote"]
        : [
            trackForState(state) ?? "lobby",
            ...(byStage[state.stage] ?? []),
            audioProfile(state.profile).music,
            ...(state.nextProfile
              ? [audioProfile(state.nextProfile).music]
              : []),
          ];
    void this.loader.warm(ids);
  }
  private async reconcile() {
    const request = ++this.reconcileId;
    const latest = this.latest;
    if (
      !latest ||
      !this.live ||
      !this.visible ||
      this.role !== "host" ||
      this.muted() ||
      !this.prefs.musicEnabled ||
      this.context?.state !== "running"
    )
      return;
    const id = trackForState(latest.state);
    if (!id) {
      this.music?.stop();
      return;
    }
    if (this.music?.track === id) return;
    const generation = this.generation;
    let chosen = id,
      buffer = await this.loader.load(this.context, id);
    if (!buffer && id !== "studio") {
      chosen = "studio";
      buffer = await this.loader.load(this.context, chosen);
    }
    if (
      !buffer ||
      this.context?.state !== "running" ||
      request !== this.reconcileId ||
      generation !== this.generation ||
      !this.live ||
      !this.visible ||
      this.muted() ||
      !this.prefs.musicEnabled
    )
      return;
    const offset = phaseOffset(latest.state, latest.receivedAt, this.now());
    try {
      this.music!.play(assets[chosen], buffer, offset);
    } catch {
      this.status = "error";
      this.error =
        "Sound is unavailable. Gameplay can continue; try Enable sound again.";
    }
    this.notify();
  }
  private async effect(
    id: string,
    state: AudioState,
    initialAge: number,
    lateMs: number,
    duck?: number,
  ) {
    if (!this.context || !this.prefs.sfxEnabled) return;
    const generation = this.generation,
      start = this.now();
    const buffer = await this.loader.load(this.context, id);
    if (
      !buffer ||
      generation !== this.generation ||
      !this.live ||
      !this.visible ||
      this.context.state !== "running" ||
      this.muted() ||
      !this.prefs.sfxEnabled ||
      state.sequence !== this.latest?.state.sequence ||
      initialAge + this.now() - start > lateMs
    ) {
      this.counts.skipped++;
      this.notify();
      return;
    }
    if (duck !== undefined && this.bus) {
      const release = this.bus.duck(duck);
      this.releases.add(release);
      const timer = setTimeout(
        () => {
          this.timers.delete(timer);
          release();
          this.releases.delete(release);
        },
        buffer.duration * 1000 + 120,
      );
      this.timers.add(timer);
    }
    if (this.sfx!.play(buffer)) this.counts.oneShots++;
    this.notify();
  }
  async feedback(kind: FeedbackKind) {
    if (
      this.role !== "player" ||
      !this.live ||
      !this.visible ||
      this.muted() ||
      !this.prefs.sfxEnabled ||
      !this.context
    )
      return;
    const at = this.now();
    if (at - (this.feedbackAt.get(kind) ?? -Infinity) < 120) return;
    this.feedbackAt.set(kind, at);
    const generation = this.generation,
      buffer = await this.loader.load(this.context, kind);
    if (
      !buffer ||
      this.now() - at > 350 ||
      generation !== this.generation ||
      !this.live ||
      this.context.state !== "running" ||
      this.muted() ||
      !this.prefs.sfxEnabled
    )
      return;
    this.ui!.play(buffer, 1, kind === "select" ? 0 : 70);
    this.notify();
  }
  private tick() {
    const latest = this.latest;
    if (
      !latest ||
      !this.live ||
      !this.visible ||
      this.role !== "host" ||
      this.context?.state !== "running" ||
      this.muted() ||
      !this.prefs.sfxEnabled
    )
      return;
    const { state, receivedAt } = latest,
      profile = audioProfile(state.profile);
    if (!profile.tension || state.stage !== "gameplay" || state.paused) return;
    const second = countdownSecond(
      state.remainingMs,
      Math.max(0, this.now() - receivedAt),
      state.paused,
    );
    if (second === null || second <= 0 || second > profile.warningAt) return;
    const key = `${state.roomId}:${state.phaseStartedAt}:${second}`;
    if (key === this.lastTick) return;
    this.lastTick = key;
    const generation = this.generation;
    void this.loader
      .load(
        this.context,
        second <= profile.urgentAt ? "tick_urgent" : "tick_soft",
      )
      .then((buffer) => {
        if (
          buffer &&
          generation === this.generation &&
          this.live &&
          this.visible &&
          !this.latest?.state.paused &&
          this.latest?.state.phaseStartedAt === state.phaseStartedAt &&
          countdownSecond(
            this.latest.state.remainingMs,
            Math.max(0, this.now() - this.latest.receivedAt),
            false,
          ) === second &&
          this.context?.state === "running" &&
          !this.muted() &&
          this.prefs.sfxEnabled
        ) {
          this.sfx!.play(buffer, 0.65);
          this.counts.ticks++;
          this.notify();
        }
      });
  }
  visibility(visible: boolean) {
    this.visible = visible;
    this.bus?.apply(this.prefs, this.role, visible && this.live);
    this.scheduler.resetBaseline();
    if (this.latest)
      this.scheduler.consume(
        this.latest.state,
        this.latest.serverTime - this.latest.state.occurredAt,
        true,
      );
    this.sfx?.dispose();
    this.ui?.dispose();
    if (!visible) {
      this.music?.dispose();
      if (this.context?.state === "running")
        void this.context.suspend().catch(() => {});
      this.status = this.context ? "suspended" : "locked";
    } else if (this.context && this.live && !this.muted()) {
      void this.unlock();
    }
    this.notify();
  }
  disconnect() {
    this.generation++;
    this.live = false;
    this.reconcileId++;
    this.scheduler.resetBaseline();
    this.cancelTimers();
    this.music?.dispose();
    this.sfx?.dispose();
    this.ui?.dispose();
    this.bus?.apply(this.prefs, this.role, false);
    this.notify();
  }
  private cancelTimers() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const release of this.releases) release();
    this.releases.clear();
    this.bus?.clear();
  }
  release() {
    this.disconnect();
    this.latest = null;
    this.generation++;
    this.loader.clear();
    this.notify();
  }
  async dispose() {
    this.release();
    this.bus?.dispose();
    if (this.context) {
      this.context.onstatechange = null;
      await this.context.close().catch(() => {});
    }
    this.context = null;
    this.bus = null;
    this.music = null;
    this.sfx = null;
    this.ui = null;
    this.listeners.clear();
  }
}
