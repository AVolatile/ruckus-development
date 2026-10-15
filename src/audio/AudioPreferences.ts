import type { AudioPreferences, AudioRole } from "./types";
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  version: 1,
  masterMuted: false,
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.65,
  sfxVolume: 0.85,
  playerEnabled: true,
};
export function normalizePreferences(value: unknown): AudioPreferences {
  const input =
    value && typeof value === "object"
      ? (value as Partial<AudioPreferences>)
      : {};
  if (input.version !== 1) return { ...DEFAULT_AUDIO_PREFERENCES };
  const bool = (key: keyof AudioPreferences) =>
    typeof input[key] === "boolean"
      ? (input[key] as boolean)
      : (DEFAULT_AUDIO_PREFERENCES[key] as boolean);
  const volume = (key: "musicVolume" | "sfxVolume") =>
    typeof input[key] === "number" && Number.isFinite(input[key])
      ? Math.min(1, Math.max(0, input[key]))
      : DEFAULT_AUDIO_PREFERENCES[key];
  return {
    version: 1,
    masterMuted: bool("masterMuted"),
    musicEnabled: bool("musicEnabled"),
    sfxEnabled: bool("sfxEnabled"),
    musicVolume: volume("musicVolume"),
    sfxVolume: volume("sfxVolume"),
    playerEnabled: bool("playerEnabled"),
  };
}
export function preferenceKey(role: AudioRole, accountId?: string | null) {
  return `ruckus-audio-v1:${role}:${role === "host" ? accountId || "device" : "device"}`;
}
export function readPreferences(key: string): AudioPreferences {
  try {
    const raw = localStorage.getItem(key);
    return normalizePreferences(
      raw && raw.length < 2048 ? JSON.parse(raw) : null,
    );
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}
export function savePreferences(key: string, value: AudioPreferences) {
  try {
    localStorage.setItem(key, JSON.stringify(normalizePreferences(value)));
  } catch {
    // Keep this tab's in-memory settings when persistence is unavailable.
    return;
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("ruckus:audio-preferences", { detail: key }),
    );
}
export function rememberAudioOwner(id: string | null) {
  try {
    if (id) sessionStorage.setItem("ruckus-audio-owner-v1", id);
    else sessionStorage.removeItem("ruckus-audio-owner-v1");
  } catch {
    /* Host capability tabs can use device preferences. */
  }
}
export function audioOwner() {
  try {
    return sessionStorage.getItem("ruckus-audio-owner-v1");
  } catch {
    return null;
  }
}
