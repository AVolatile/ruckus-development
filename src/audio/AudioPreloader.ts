import { assetCatalog } from "./assetCatalog";
import type { AudioAsset } from "./types";
export const assets: Record<string, AudioAsset> =
  assetCatalog as unknown as Record<string, AudioAsset>;
export class AudioPreloader {
  private raw = new Map<string, Promise<ArrayBuffer>>();
  private decoded = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private failures = new Set<string>();
  private abort = new AbortController();
  private epoch = 0;
  private retryAt = new Map<string, number>();
  constructor(
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private warn: (message: string) => void = (message) =>
      console.warn(message),
  ) {}
  get loaded() {
    return this.decoded.size;
  }
  private bytes(format: AudioAsset["formats"][number]) {
    const old = this.raw.get(format.url);
    if (old) {
      this.raw.delete(format.url);
      this.raw.set(format.url, old);
      return old;
    }
    const promise = (async () => {
      if (!/^\/audio\/[a-z0-9_-]+\.[a-f0-9]{12}\.(ogg|mp3)$/.test(format.url))
        throw new Error("Untrusted audio path");
      const response = await this.fetcher(format.url, {
        credentials: "same-origin",
        signal: this.abort.signal,
        cache: "force-cache",
        redirect: "error",
      });
      if (
        !response.ok ||
        !["audio/ogg", "application/ogg", "audio/mpeg"].includes(
          (response.headers.get("content-type") ?? "").split(";")[0],
        ) ||
        Number(response.headers.get("content-length") ?? 0) > 750000
      )
        throw new Error("Audio unavailable");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 750000) throw new Error("Oversized audio");
      return bytes;
    })();
    this.raw.set(format.url, promise);
    while (this.raw.size > 16) this.raw.delete(this.raw.keys().next().value!);
    void promise.catch(() => {
      if (this.raw.get(format.url) === promise) this.raw.delete(format.url);
    });
    return promise;
  }
  async warm(ids: string[]) {
    const generation = this.epoch;
    const queue = [...new Set(ids)].filter(
      (id) => assets[id] && (this.retryAt.get(id) ?? 0) <= Date.now(),
    );
    let index = 0;
    await Promise.all(
      [0, 1].map(async () => {
        while (index < queue.length && generation === this.epoch) {
          const asset = assets[queue[index++]];
          try {
            await this.bytes(asset.formats[0]);
          } catch {
            /* Failed primaries can still use fallback at decode. */
          }
        }
      }),
    );
  }
  load(context: AudioContext, id: string): Promise<AudioBuffer | null> {
    if ((this.retryAt.get(id) ?? 0) > Date.now()) return Promise.resolve(null);
    const generation = this.epoch;
    const cached = this.decoded.get(id);
    if (cached) {
      this.decoded.delete(id);
      this.decoded.set(id, cached);
      return Promise.resolve(cached);
    }
    const existing = this.pending.get(id);
    if (existing) return existing;
    const job = (async () => {
      for (const format of assets[id]?.formats ?? []) {
        if (generation !== this.epoch) return null;
        try {
          const bytes = await this.bytes(format);
          const buffer = await context.decodeAudioData(bytes.slice(0));
          if (generation !== this.epoch) return null;
          this.retryAt.delete(id);
          this.decoded.set(id, buffer);
          while (this.decoded.size > 8)
            this.decoded.delete(this.decoded.keys().next().value!);
          return buffer;
        } catch {
          /* Try the trusted MP3 fallback. */
        }
      }
      if (generation !== this.epoch) return null;
      this.retryAt.set(id, Date.now() + 30000);
      if (!this.failures.has(id)) {
        this.failures.add(id);
        this.warn(`Ruckus audio unavailable: ${id}`);
      }
      return null;
    })();
    this.pending.set(id, job);
    void job.finally(() => {
      if (this.pending.get(id) === job) this.pending.delete(id);
    });
    return job;
  }
  clear() {
    this.epoch++;
    this.retryAt.clear();
    this.abort.abort();
    this.abort = new AbortController();
    this.raw.clear();
    this.decoded.clear();
    this.pending.clear();
  }
}
