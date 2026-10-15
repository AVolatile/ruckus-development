export class SfxController {
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  constructor(
    private context: AudioContext,
    private output: AudioNode,
    private changed: () => void = () => {},
  ) {}
  get count() {
    return this.voices.size;
  }
  play(buffer: AudioBuffer, gainValue = 1, delayMs = 0) {
    let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined;
    try {
      while (this.voices.size >= 6) {
        const [old, oldGain] = this.voices.entries().next().value!;
        old.onended = null;
        old.stop();
        old.disconnect();
        oldGain.disconnect();
        this.voices.delete(old);
      }
      source = this.context.createBufferSource();
      gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = gainValue;
      source.connect(gain);
      gain.connect(this.output);
      this.voices.set(source, gain);
      const voice = source,
        node = gain;
      source.onended = () => {
        this.voices.delete(voice);
        voice.disconnect();
        node.disconnect();
        this.changed();
      };
      source.start(this.context.currentTime + delayMs / 1000);
      return true;
    } catch {
      source?.disconnect();
      gain?.disconnect();
      if (source) this.voices.delete(source);
      return false;
    }
  }
  dispose() {
    for (const [voice, gain] of this.voices) {
      voice.onended = null;
      try {
        voice.stop();
      } catch {
        /* Already stopped. */
      }
      voice.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
  }
}
