import type { AudioState } from "./types";
import { presentationEffects } from "./CueRegistry";
export interface CursorStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
const KEY = "ruckus-audio-cursors-v1";
export class CueScheduler {
  private roomId = "";
  private last = -1;
  private cursors: Record<string, number> = {};
  constructor(private storage?: CursorStorage) {
    try {
      const parsed = JSON.parse(storage?.getItem(KEY) ?? "{}");
      for (const [id, value] of Object.entries(parsed).slice(-24))
        if (
          typeof value === "number" &&
          Number.isSafeInteger(value) &&
          value >= 0
        )
          this.cursors[id] = value;
    } catch {
      /* Optional dedupe cache. */
    }
  }
  consume(state: AudioState, ageMs: number, baseline = false) {
    const newRoom = this.roomId !== state.roomId;
    if (newRoom) {
      this.roomId = state.roomId;
      this.last = this.cursors[state.roomId] ?? -1;
      baseline = true;
    }
    const seen = state.sequence <= this.last;
    this.last = Math.max(state.sequence, this.last);
    this.cursors[state.roomId] = this.last;
    this.cursors = Object.fromEntries(Object.entries(this.cursors).slice(-24));
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.cursors));
    } catch {
      /* In-memory dedupe remains. */
    }
    if (baseline || seen) return [];
    return presentationEffects(state.names).filter(
      (cue) => ageMs >= -150 && ageMs <= cue.lateMs,
    );
  }
  resetBaseline() {
    this.roomId = "";
  }
}
export function phaseOffset(state: AudioState, receiptAt: number, now: number) {
  return (
    Math.max(
      0,
      state.elapsedMs + (state.paused ? 0 : Math.max(0, now - receiptAt)),
    ) / 1000
  );
}
export function countdownSecond(
  remainingMs: number | null,
  elapsedSinceSnapshot: number,
  paused: boolean,
) {
  return remainingMs === null || paused
    ? null
    : Math.max(0, Math.ceil((remainingMs - elapsedSinceSnapshot) / 1000));
}

export function safeCursorStorage(): CursorStorage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
