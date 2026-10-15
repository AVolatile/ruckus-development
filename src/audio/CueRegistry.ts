import type { AudioCue, AudioState } from "./types";
import { audioProfile } from "./gameAudioProfiles";
export interface CueDefinition {
  classification: "stateful" | "one-shot";
  effect?: string;
  lateMs: number;
  duck?: number;
  priority: number;
}
export const cueRegistry: Record<AudioCue, CueDefinition> = {
  LOBBY_ENTER: { classification: "stateful", lateMs: 0, priority: 0 },
  EVENT_START: {
    classification: "one-shot",
    effect: "event_start",
    lateMs: 700,
    duck: 0.4,
    priority: 7,
  },
  EVENT_INTRO_ENTER: { classification: "stateful", lateMs: 0, priority: 0 },
  SEGMENT_INTRO_ENTER: {
    classification: "one-shot",
    effect: "segment_intro",
    lateMs: 650,
    duck: 0.5,
    priority: 6,
  },
  QUESTION_OPEN: { classification: "stateful", lateMs: 0, priority: 0 },
  ANSWER_LOCKED: {
    classification: "one-shot",
    effect: "lock",
    lateMs: 400,
    priority: 3,
  },
  REVEAL_ENTER: {
    classification: "one-shot",
    effect: "reveal",
    lateMs: 650,
    duck: 0.22,
    priority: 8,
  },
  GAME_RESULTS_ENTER: { classification: "stateful", lateMs: 0, priority: 0 },
  EVENT_LEADERBOARD_ENTER: {
    classification: "one-shot",
    effect: "leaderboard_sting",
    lateMs: 700,
    duck: 0.3,
    priority: 5,
  },
  INTERMISSION_ENTER: { classification: "stateful", lateMs: 0, priority: 0 },
  FINAL_RESULTS_ENTER: {
    classification: "stateful",
    effect: "finale_sting",
    lateMs: 700,
    duck: 0.25,
    priority: 10,
  },
  EVENT_END: {
    classification: "one-shot",
    effect: "end",
    lateMs: 650,
    duck: 0,
    priority: 9,
  },
};
export function trackForState(state: AudioState): string | null {
  switch (state.stage) {
    case "ended":
      return null;
    case "gameplay":
    case "voting":
      return audioProfile(state.profile).music;
    case "reveal":
    case "results":
      return "results";
    case "leaderboard":
      return "leaderboard";
    case "finale":
      return "finale";
    case "lobby":
      return "lobby";
    case "intro":
      return "intro";
    case "intermission":
      return "intermission";
  }
}
export function presentationEffects(names: AudioCue[]) {
  const effects = names
    .map((name) => ({ name, ...cueRegistry[name] }))
    .filter((v) => v.effect)
    .sort((a, b) => b.priority - a.priority); // Co-occurring presentation cues choose one clean accent; the stateful bed still reconciles.
  return effects.slice(0, 1);
}
