import { useEffect, useState, useCallback, useRef } from "react";
import { readPreferences, savePreferences } from "./AudioPreferences";
import type { AudioPreferences } from "./types";
export function useAudioPreferences(key: string) {
  const [prefs, setPrefs] = useState(() => readPreferences(key));
  const current = useRef(prefs);
  current.current = prefs;
  useEffect(() => {
    setPrefs(readPreferences(key));
    const update = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== key) return;
      setPrefs(readPreferences(key));
    };
    // Saved defaults apply on load; another tab must not mute this stage.
    window.addEventListener("ruckus:audio-preferences", update);
    return () => {
      window.removeEventListener("ruckus:audio-preferences", update);
    };
  }, [key]);
  const update = useCallback(
    (patch: Partial<AudioPreferences>) => {
      const next = { ...current.current, ...patch, version: 1 as const };
      current.current = next;
      savePreferences(key, next);
      setPrefs(next);
    },
    [key],
  );
  return { prefs, update };
}
