import { ramp } from "./AudioBus";
import type { AudioAsset } from "./types";
interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  id: string;
}
export class MusicController {
  private current: Voice | null = null;
  private retiring = new Set<Voice>();
  constructor(
    private context: AudioContext,
    private output: AudioNode,
    private changed: () => void = () => {},
  ) {}
  get track() {
    return this.current?.id ?? null;
  }
  get count() {
    return (this.current ? 1 : 0) + this.retiring.size;
  }
  play(asset: AudioAsset, buffer: AudioBuffer, offset: number, fadeMs = 360) {
    if (this.current?.id === asset.id) return false;
    const source = this.context.createBufferSource(),
      gain = this.context.createGain(),
      now = this.context.currentTime;
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = asset.loopStart;
    source.loopEnd = Math.min(asset.loopEnd, buffer.duration);
    const length = source.loopEnd - source.loopStart;
    if (length <= 0) return false;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.output);
    const voice = { source, gain, id: asset.id };
    source.onended = () => {
      gain.disconnect();
      source.disconnect();
      this.retiring.delete(voice);
      this.changed();
    };
    source.start(now, asset.loopStart + (Math.max(0, offset) % length));
    ramp(this.context, gain.gain, 1, fadeMs / 1000);
    if (this.current) this.retire(this.current, fadeMs);
    this.current = voice;
    return true;
  }
  private retire(voice: Voice, fadeMs: number) {
    this.retiring.add(voice);
    ramp(this.context, voice.gain.gain, 0, fadeMs / 1000);
    voice.source.stop(this.context.currentTime + fadeMs / 1000 + 0.02);
    while (this.retiring.size > 2) {
      const old = this.retiring.values().next().value!;
      old.source.stop();
      old.source.disconnect();
      old.gain.disconnect();
      this.retiring.delete(old);
    }
  }
  stop(fadeMs = 280) {
    if (this.current) {
      this.retire(this.current, fadeMs);
      this.current = null;
    }
  }
  dispose() {
    for (const voice of [
      ...this.retiring,
      ...(this.current ? [this.current] : []),
    ]) {
      voice.source.onended = null;
      try {
        voice.source.stop();
      } catch {
        /* Already stopped. */
      }
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.current = null;
    this.retiring.clear();
  }
}
