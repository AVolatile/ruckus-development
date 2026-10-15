import { ramp } from "./AudioBus";
import type { AudioAsset } from "./types";
export const MUSIC_CROSSFADE_MS = 360;
// Matches the scheduled audio stop; cleanup also runs if ended delivery is delayed.
export const MUSIC_STOP_GRACE_MS = 20;
interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  id: string;
  cleanup: ReturnType<typeof setTimeout> | null;
}
export class MusicController {
  private current: Voice | null = null;
  private retiring = new Set<Voice>();
  private owned = new Set<Voice>();
  constructor(
    private context: AudioContext,
    private output: AudioNode,
    private changed: () => void = () => {},
  ) {}
  get track() {
    return this.current?.id ?? null;
  }
  get currentCount() {
    return this.current ? 1 : 0;
  }
  get retiringCount() {
    return this.retiring.size;
  }
  get count() {
    return this.owned.size;
  }
  play(
    asset: AudioAsset,
    buffer: AudioBuffer,
    offset: number,
    fadeMs = MUSIC_CROSSFADE_MS,
  ) {
    if (this.current?.id === asset.id) return false;
    const end = Math.min(asset.loopEnd, buffer.duration);
    const length = end - asset.loopStart;
    if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(offset))
      return false;
    const source = this.context.createBufferSource();
    let gain: GainNode;
    try {
      gain = this.context.createGain();
    } catch (error) {
      source.disconnect();
      throw error;
    }
    const voice: Voice = { source, gain, id: asset.id, cleanup: null };
    // Own every allocated voice before any operation can start audible playback.
    this.owned.add(voice);
    source.onended = () => this.destroy(voice);
    try {
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = asset.loopStart;
      source.loopEnd = end;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.output);
      ramp(this.context, gain.gain, 1, fadeMs / 1000);
      // A rapid third request finishes the oldest retirement rather than stacking beds.
      for (const old of this.retiring) this.destroy(old);
      if (this.current) this.retire(this.current, fadeMs);
      this.current = voice;
      source.start(
        this.context.currentTime,
        asset.loopStart + (Math.max(0, offset) % length),
      );
      return true;
    } catch (error) {
      this.destroy(voice);
      throw error;
    }
  }
  private retire(voice: Voice, fadeMs: number) {
    if (this.current === voice) this.current = null;
    this.retiring.add(voice);
    try {
      ramp(this.context, voice.gain.gain, 0, fadeMs / 1000);
      voice.source.stop(
        this.context.currentTime + (fadeMs + MUSIC_STOP_GRACE_MS) / 1000,
      );
      voice.cleanup = setTimeout(
        () => this.destroy(voice),
        fadeMs + MUSIC_STOP_GRACE_MS,
      );
    } catch (error) {
      // A failed automation/stop cannot leave the prior bed connected indefinitely.
      this.destroy(voice);
      throw error;
    }
  }
  private destroy(voice: Voice) {
    if (!this.owned.delete(voice)) return;
    if (voice.cleanup !== null) clearTimeout(voice.cleanup);
    voice.source.onended = null;
    if (this.current === voice) this.current = null;
    this.retiring.delete(voice);
    try {
      voice.source.stop();
    } catch {
      // A prepared voice may not have started; disconnect is still mandatory.
    } finally {
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.changed();
  }
  stop(fadeMs = 280) {
    for (const old of this.retiring) this.destroy(old);
    if (this.current) this.retire(this.current, fadeMs);
  }
  dispose() {
    for (const voice of this.owned) this.destroy(voice);
  }
}
