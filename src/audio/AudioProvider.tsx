import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Outlet, useParams, useLocation } from "react-router-dom";
import { useParty } from "../lib/party";
import { AudioEngine } from "./AudioEngine";
import { AudioContextState } from "./AudioContext";
import { AudioControls } from "./AudioControls";
import { audioOwner, preferenceKey } from "./AudioPreferences";
import { useAudioPreferences } from "./useAudioPreferences";
import { subscribeFeedback } from "./feedback";
import type { AudioRole, AudioPreferences } from "./types";
let sharedEngine: AudioEngine | undefined;
export function AudioProvider({
  role,
  code,
  children,
}: {
  role: AudioRole;
  code?: string;
  children: ReactNode;
}) {
  const [engine] = useState(() => (sharedEngine ??= new AudioEngine()));
  const party = useParty(),
    key = preferenceKey(role, role === "host" ? audioOwner() : null),
    { prefs, update: updatePrefs } = useAudioPreferences(key);
  const [diagnostics, setDiagnostics] = useState(() => engine.diagnostics()),
    previousEpoch = useRef(-1),
    revealed = useRef("");
  useEffect(
    () => engine.subscribe(() => setDiagnostics(engine.diagnostics())),
    [engine],
  );
  useEffect(() => {
    engine.configure(role, prefs);
  }, [engine, role, prefs]);
  useEffect(() => {
    const room = party.room;
    if (
      !room?.audio ||
      room.code !== code ||
      party.identity?.role !== role ||
      !party.connected ||
      !party.synchronized
    ) {
      engine.disconnect();
      previousEpoch.current = -1;
      return;
    }
    const baseline = previousEpoch.current !== party.audioEpoch;
    engine.sync(room.audio, room.serverTime, baseline);
    previousEpoch.current = party.audioEpoch;
    if (
      role === "player" &&
      room.phase === "results" &&
      room.correct.length > 0 &&
      room.prompt?.questionType !== "poll" &&
      room.prompt?.scoreMode !== "no-score" &&
      ["hotwire", "odd-one-in"].includes(room.settings.playlist[room.gameIndex])
    ) {
      const player = room.players.find((p) => p.id === room.you),
        id = `${room.audio.roomId}:${room.roundKey}`;
      if (revealed.current !== id) {
        revealed.current = id;
        if (!baseline && player?.submitted)
          void engine.feedback(player.delta > 0 ? "correct" : "incorrect");
      }
    }
  }, [
    engine,
    party.room,
    party.connected,
    party.synchronized,
    party.audioEpoch,
    party.identity?.role,
    role,
    code,
  ]);
  useEffect(() => {
    const gesture = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        !["Enter", " ", "m", "M"].includes(event.key)
      )
        return;
      if (
        (event.target instanceof Element &&
          event.target.closest("button,input,select,summary,a")) ||
        event instanceof KeyboardEvent
      )
        void engine.unlock();
    };
    const visibility = () => engine.visibility(!document.hidden);
    visibility();
    document.addEventListener("click", gesture);
    document.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", visibility);
    const unsubscribe = subscribeFeedback((kind) => {
      void engine.feedback(kind);
    });
    return () => {
      document.removeEventListener("click", gesture);
      document.removeEventListener("keydown", gesture);
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      engine.release();
    };
  }, [engine]);
  const unlock = useCallback(() => {
    void engine.unlock();
  }, [engine]);
  const update = useCallback(
    (patch: Partial<AudioPreferences>) => {
      updatePrefs(patch);
      const next = { ...prefs, ...patch };
      engine.configure(role, next);
      if (!next.masterMuted && (role === "host" || next.playerEnabled))
        void engine.unlock();
    },
    [engine, prefs, role, updatePrefs],
  );
  const toggleMute = useCallback(() => {
    update(
      role === "player"
        ? { playerEnabled: !prefs.playerEnabled }
        : { masterMuted: !prefs.masterMuted },
    );
  }, [prefs, role, update]);
  return (
    <AudioContextState.Provider
      value={{ role, prefs, diagnostics, update, unlock, toggleMute }}
    >
      {children}
    </AudioContextState.Provider>
  );
}
export default function LiveAudioBoundary() {
  const { code } = useParams(),
    location = useLocation(),
    party = useParty(),
    role: AudioRole = location.pathname.endsWith("/host") ? "host" : "player";
  const ready = party.room?.code === code && party.identity?.role === role;
  return (
    <AudioProvider
      key={`${role}:${role === "host" ? audioOwner() : "device"}`}
      code={code}
      role={role}
    >
      {ready && <AudioControls />}
      <Outlet />
    </AudioProvider>
  );
}
