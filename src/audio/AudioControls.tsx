import { useId } from "react";
import { useLiveAudio } from "./AudioContext";
import { useAudioPreferences } from "./useAudioPreferences";
import { preferenceKey } from "./AudioPreferences";
import type { AudioPreferences } from "./types";
function HostFields({
  prefs,
  update,
}: {
  prefs: AudioPreferences;
  update: (patch: Partial<AudioPreferences>) => void;
}) {
  const id = useId();
  return (
    <div className="audio-fields">
      <label>
        <input
          type="checkbox"
          checked={!prefs.masterMuted}
          onChange={(e) => update({ masterMuted: !e.target.checked })}
        />{" "}
        Sound enabled
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.musicEnabled}
          onChange={(e) => update({ musicEnabled: e.target.checked })}
        />{" "}
        Music enabled
      </label>
      <label htmlFor={id + "-music"}>
        Music volume <output>{Math.round(prefs.musicVolume * 100)}%</output>
      </label>
      <input
        id={id + "-music"}
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(prefs.musicVolume * 100)}
        onChange={(e) => update({ musicVolume: Number(e.target.value) / 100 })}
      />
      <label>
        <input
          type="checkbox"
          checked={prefs.sfxEnabled}
          onChange={(e) => update({ sfxEnabled: e.target.checked })}
        />{" "}
        Effects enabled
      </label>
      <label htmlFor={id + "-effects"}>
        Effects volume <output>{Math.round(prefs.sfxVolume * 100)}%</output>
      </label>
      <input
        id={id + "-effects"}
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(prefs.sfxVolume * 100)}
        onChange={(e) => update({ sfxVolume: Number(e.target.value) / 100 })}
      />
    </div>
  );
}
export function AudioControls() {
  const audio = useLiveAudio(),
    d = audio.diagnostics;
  const needsUnlock = [
    "uninitialized",
    "locked",
    "suspended",
    "error",
  ].includes(d.status);
  return (
    <aside
      className={`live-audio-controls audio-${audio.role}`}
      aria-label={audio.role === "host" ? "Host audio" : "Player sound"}
      data-audio-state={d.status}
      data-audio-context={d.contextState}
      data-audio-track={d.track ?? ""}
      data-audio-cue={d.cue ?? ""}
      data-audio-sequence={d.sequence}
      data-audio-shots={d.oneShots}
      data-audio-ticks={d.ticks}
      data-audio-sources={d.sources}
      data-audio-loaded={d.loaded}
      data-audio-profile={d.profile ?? ""}
      data-audio-role={audio.role}
    >
      <button
        className="audio-toggle"
        onClick={audio.toggleMute}
        aria-pressed={
          audio.role === "player"
            ? !audio.prefs.playerEnabled
            : audio.prefs.masterMuted
        }
      >
        {audio.role === "player"
          ? audio.prefs.playerEnabled
            ? "Phone sound on"
            : "Phone sound off"
          : audio.prefs.masterMuted
            ? "Sound off"
            : "Sound on"}
      </button>
      {audio.role === "host" && (
        <details className="audio-mixer">
          <summary>Music & effects</summary>
          <div className="audio-mixer-panel">
            <HostFields prefs={audio.prefs} update={audio.update} />
            <p>
              Sound plays on this screen. Music and effects are independent.
            </p>
          </div>
        </details>
      )}
      {needsUnlock && d.status !== "muted" && (
        <button className="audio-enable" onClick={audio.unlock}>
          {d.status === "error" ? "Retry sound" : "Enable sound"}
        </button>
      )}
      {d.status === "error" && audio.role === "host" && (
        <span role="status">Sound unavailable. Keep playing, or retry.</span>
      )}
      {audio.role === "host" && <small>Room soundtrack · this tab</small>}
    </aside>
  );
}
export function AudioSettings({ accountId }: { accountId: string }) {
  const { prefs, update } = useAudioPreferences(
    preferenceKey("host", accountId),
  );
  return (
    <section className="section audio-settings">
      <div>
        <span className="eyebrow">YOUR HOST SOUND</span>
        <h2>A little louder. Or a little quieter.</h2>
        <p>
          Saved for this account in this browser. Your host screen owns the
          soundtrack; phones keep their own quiet feedback. You can play fully
          muted.
        </p>
      </div>
      <HostFields prefs={prefs} update={update} />
    </section>
  );
}
