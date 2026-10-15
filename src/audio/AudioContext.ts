import { createContext, useContext } from "react";
import type { AudioPreferences, AudioDiagnostics, AudioRole } from "./types";
export interface LiveAudio {
  role: AudioRole;
  prefs: AudioPreferences;
  diagnostics: AudioDiagnostics;
  update: (patch: Partial<AudioPreferences>) => void;
  unlock: () => void;
  toggleMute: () => void;
}
export const AudioContextState = createContext<LiveAudio | null>(null);
export function useLiveAudio() {
  const value = useContext(AudioContextState);
  if (!value) throw new Error("Live audio boundary is missing.");
  return value;
}
