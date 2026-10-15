import type { AudioProfileId, AudioState, AudioCue } from "../../shared/audio";
export type { AudioProfileId, AudioState, AudioCue };
export type AudioRole = "host" | "player";
export type EngineStatus =
  "uninitialized" | "locked" | "ready" | "suspended" | "muted" | "error";
export interface AudioPreferences {
  version: 1;
  masterMuted: boolean;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  playerEnabled: boolean;
}
export interface AudioAsset {
  id: string;
  kind: string;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  duration: number;
  formats: { url: string; mime: string; bytes: number; sha256: string }[];
}
export type FeedbackKind =
  "select" | "confirm" | "vote" | "correct" | "incorrect";
export interface AudioDiagnostics {
  status: EngineStatus;
  contextState: string;
  track: string | null;
  profile: string | null;
  stage: string | null;
  cue: string | null;
  sequence: number;
  loaded: number;
  sources: number;
  oneShots: number;
  skipped: number;
  ticks: number;
  error: string | null;
}
