import type { AudioProfileId } from "./types";
export interface GameAudioProfile {
  music: string;
  tension: boolean;
  warningAt: number;
  urgentAt: number;
}
export const gameAudioProfiles: Record<AudioProfileId, GameAudioProfile> = {
  hotwire: { music: "hotwire", tension: true, warningAt: 5, urgentAt: 3 },
  "room-temperature": {
    music: "room-temperature",
    tension: false,
    warningAt: 3,
    urgentAt: 2,
  },
  sellout: { music: "sellout", tension: true, warningAt: 3, urgentAt: 2 },
  "caption-this": {
    music: "caption-this",
    tension: true,
    warningAt: 3,
    urgentAt: 2,
  },
  "odd-one-in": {
    music: "odd-one-in",
    tension: true,
    warningAt: 5,
    urgentAt: 3,
  },
  "scribble-shift": {
    music: "scribble-shift",
    tension: true,
    warningAt: 3,
    urgentAt: 2,
  },
  studio: { music: "studio", tension: true, warningAt: 5, urgentAt: 3 },
  "studio-poll": {
    music: "room-temperature",
    tension: false,
    warningAt: 0,
    urgentAt: 0,
  },
};
export function audioProfile(id: string): GameAudioProfile {
  return gameAudioProfiles[id as AudioProfileId] ?? gameAudioProfiles.studio;
}
