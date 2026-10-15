import type { AudioPreferences, AudioRole } from "./types";
export function ramp(
  context: AudioContext,
  param: AudioParam,
  target: number,
  seconds = 0.035,
) {
  const now = context.currentTime;
  if (typeof param.cancelAndHoldAtTime === "function")
    param.cancelAndHoldAtTime(now);
  else {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
  }
  param.linearRampToValueAtTime(target, now + seconds);
}
export class AudioBus {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly ui: GainNode;
  readonly musicDuck: GainNode;
  private ducks = new Map<number, number>();
  private counter = 0;
  private paused = false;
  private limiter: DynamicsCompressorNode;
  constructor(readonly context: AudioContext) {
    this.master = context.createGain();
    this.music = context.createGain();
    this.sfx = context.createGain();
    this.ui = context.createGain();
    this.musicDuck = context.createGain();
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.music.connect(this.musicDuck);
    this.musicDuck.connect(this.master);
    this.sfx.connect(this.master);
    this.ui.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(context.destination);
    this.master.gain.value = 0;
  }
  apply(p: AudioPreferences, role: AudioRole, visible = true) {
    ramp(
      this.context,
      this.master.gain,
      p.masterMuted || !visible || (role === "player" && !p.playerEnabled)
        ? 0
        : 1,
    );
    ramp(
      this.context,
      this.music.gain,
      role === "host" && p.musicEnabled ? p.musicVolume * 0.65 : 0,
    );
    ramp(this.context, this.sfx.gain, p.sfxEnabled ? p.sfxVolume * 0.7 : 0);
    ramp(
      this.context,
      this.ui.gain,
      p.sfxEnabled ? p.sfxVolume * (role === "player" ? 0.24 : 0.32) : 0,
    );
  }
  duck(factor: number) {
    const id = ++this.counter;
    this.ducks.set(id, Math.max(0, Math.min(1, factor)));
    this.reconcile();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ducks.delete(id);
      this.reconcile();
    };
  }
  pause(value: boolean) {
    this.paused = value;
    this.reconcile();
  }
  private reconcile() {
    ramp(
      this.context,
      this.musicDuck.gain,
      Math.min(this.paused ? 0.16 : 1, ...this.ducks.values()),
      0.08,
    );
  }
  clear() {
    this.ducks.clear();
    this.paused = false;
    this.reconcile();
  }
  dispose() {
    for (const node of [
      this.master,
      this.music,
      this.sfx,
      this.ui,
      this.musicDuck,
      this.limiter,
    ])
      node.disconnect();
    this.ducks.clear();
  }
}
