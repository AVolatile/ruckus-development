import type { EventCue } from "./events.js";
import type { GameId, Phase } from "./types.js";
export type AudioCue = EventCue;
export type AudioProfileId = GameId | "studio" | "studio-poll";
export type AudioStage =
  | "lobby"
  | "intro"
  | "gameplay"
  | "voting"
  | "reveal"
  | "results"
  | "leaderboard"
  | "intermission"
  | "finale"
  | "ended";
// Presentation metadata only. The browser chooses assets; no gameplay depends on audio.
export interface AudioState {
  roomId: string;
  sequence: number;
  names: AudioCue[];
  occurredAt: number;
  phase: string;
  phaseStartedAt: number;
  elapsedMs: number;
  remainingMs: number | null;
  paused: boolean;
  profile: AudioProfileId;
  nextProfile?: AudioProfileId;
  stage: AudioStage;
}
export const standaloneStage: Record<Phase, AudioStage> = {
  lobby: "lobby",
  intro: "intro",
  active: "gameplay",
  voting: "voting",
  results: "reveal",
  intermission: "intermission",
  final: "finale",
  ended: "ended",
};
export function standaloneCues(
  phase: Phase,
  previous: Phase,
  firstGame = false,
): AudioCue[] {
  switch (phase) {
    case "lobby":
      return ["LOBBY_ENTER"];
    case "intro":
      return firstGame
        ? ["EVENT_START", "SEGMENT_INTRO_ENTER"]
        : ["SEGMENT_INTRO_ENTER"];
    case "active":
      return ["QUESTION_OPEN"];
    case "voting":
      return ["ANSWER_LOCKED"];
    case "results":
      return previous === "voting"
        ? ["REVEAL_ENTER"]
        : ["ANSWER_LOCKED", "REVEAL_ENTER"];
    case "intermission":
      return ["INTERMISSION_ENTER", "EVENT_LEADERBOARD_ENTER"];
    case "final":
      return ["GAME_RESULTS_ENTER", "FINAL_RESULTS_ENTER"];
    case "ended":
      return ["EVENT_END"];
  }
}
