import { PackChooser } from "../content/PackChooser";
import { useWorkspace } from "../workspaces/context";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Link, useNavigate } from "../workspaces/navigation";
import {
  AVATAR_COLORS,
  AVATAR_NAMES,
  DEFAULT_SETTINGS,
  GAMES,
  PACKS,
} from "../../shared/catalog";
import type { Settings } from "../../shared/types";
import { Avatar, Icon, Logo, Star, Tag } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
import { useParty } from "../lib/party";
import { DemoButton } from "../components/DemoButton";
export function HostSetup() {
  const { current } = useWorkspace();
  const [selections, setSelections] = useState<
    Partial<Record<Settings["playlist"][number], string>>
  >(() => {
    const p = new URLSearchParams(location.search),
      g = p.get("game"),
      id = p.get("contentPackId");
    return g && id ? { [g]: id } : {};
  });
  const party = useParty(),
    navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(() => {
      const requested = new URLSearchParams(window.location.search).get("game");
      return {
        ...DEFAULT_SETTINGS,
        playlist: GAMES.some((g) => g.id === requested)
          ? [requested as Settings["playlist"][number]]
          : [...DEFAULT_SETTINGS.playlist],
      };
    }),
    [preset, setPreset] = useState("10"),
    [busy, setBusy] = useState(false);
  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }));
  const presets = [
    { id: "5", name: "Quick hit", games: ["room-temperature"], rounds: 3 },
    {
      id: "10",
      name: "Good mix",
      games: ["room-temperature", "hotwire", "sellout"],
      rounds: 2,
    },
    {
      id: "20",
      name: "The long lunch",
      games: ["room-temperature", "caption-this", "scribble-shift", "hotwire"],
      rounds: 3,
    },
    { id: "30", name: "Full Ruckus", games: GAMES.map((g) => g.id), rounds: 3 },
  ];
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const reply = await party.create(settings, false, undefined, undefined, {
      workspaceId: current.id,
      selections: Object.fromEntries(
        Object.entries(selections).filter(([g]) =>
          settings.playlist.includes(g as Settings["playlist"][number]),
        ),
      ),
    });
    setBusy(false);
    if (reply.ok && reply.identity)
      navigate(`/room/${reply.identity.code}/host`);
  }
  return (
    <div className="setup-page">
      <div className="setup-intro">
        <span className="eyebrow">YOU’RE ON HOST DUTY.</span>
        <h1>
          Good things
          <br />
          start with
          <br />
          <span>a room code.</span>
        </h1>
        <p>
          Choose your lineup. Claim a screen.
          <br />
          Give your people a very good distraction.
        </p>
        <div className="setup-character">
          <Avatar id={5} size={190} />
          <Star />
          <span>
            Promoted to
            <br />
            party starter.
          </span>
        </div>
        <div className="setup-demo">
          <p>Just looking around?</p>
          <DemoButton className="button outline" />
        </div>
      </div>
      <form className="setup-form" onSubmit={create}>
        <div className="form-step">
          <span className="eyebrow">01 / MAKE SOME TIME</span>
          <h2>How much room for Ruckus?</h2>
          <div className="preset-grid">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                className={`preset ${preset === p.id ? "selected" : ""}`}
                onClick={() => {
                  setPreset(p.id);
                  patch({
                    playlist: p.games as Settings["playlist"],
                    rounds: p.rounds,
                  });
                }}
              >
                <b>
                  {p.id}
                  <small> MIN</small>
                </b>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <p className="field-help">
            Approximate playtime. The room’s pace is up to you.
          </p>
        </div>
        <div className="form-step">
          <span className="eyebrow">02 / PICK YOUR TROUBLE</span>
          <h2>The lineup</h2>
          <p className="field-help">
            Games play in selection order. Pick at least one.
          </p>
          <div className="game-checkboxes">
            {GAMES.map((g) => (
              <button
                type="button"
                key={g.id}
                aria-pressed={settings.playlist.includes(g.id)}
                className={`game-check ${settings.playlist.includes(g.id) ? "selected" : ""}`}
                onClick={() => {
                  setPreset("custom");
                  patch({
                    playlist: settings.playlist.includes(g.id)
                      ? settings.playlist.filter((id) => id !== g.id)
                      : [...settings.playlist, g.id],
                  });
                }}
              >
                <span
                  className="game-check-icon"
                  style={{ background: g.color }}
                >
                  <Icon name={g.icon} />
                </span>
                <span>
                  <b>{g.name}</b>
                  <small>{g.short}</small>
                </span>
                <span className="check-number">
                  {settings.playlist.includes(g.id)
                    ? settings.playlist.indexOf(g.id) + 1
                    : "+"}
                </span>
              </button>
            ))}
          </div>
          {!settings.playlist.length && (
            <p className="field-error">
              Choose at least one game to open the room.
            </p>
          )}
          <fieldset className="pack-lineup">
            <legend>Content Packs</legend>
            <p>
              Choose a ready pack for each game, or keep the Ruckus defaults.
            </p>
            {settings.playlist.map((game) => (
              <div key={game}>
                <h3>{GAMES.find((g) => g.id === game)?.name}</h3>
                <PackChooser
                  game={game}
                  value={selections[game]}
                  onChange={(id) =>
                    setSelections((s) => ({ ...s, [game]: id }))
                  }
                />
              </div>
            ))}
          </fieldset>
        </div>
        <div className="form-step">
          <span className="eyebrow">03 / YOUR HOUSE RULES</span>
          <div className="form-two-col">
            <label>
              Topic filter
              <select
                value={settings.pack}
                onChange={(e) => patch({ pack: e.target.value })}
              >
                {PACKS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Timer pace
              <select
                value={settings.pace}
                onChange={(e) =>
                  patch({ pace: e.target.value as Settings["pace"] })
                }
              >
                <option value="quick">Quick & lively</option>
                <option value="normal">A comfortable beat</option>
                <option value="relaxed">Room to think</option>
              </select>
            </label>
            <label>
              Rounds per game
              <select
                value={settings.rounds}
                onChange={(e) => patch({ rounds: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} round{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {[
            {
              key: "lateJoins",
              label: "Let late arrivals join",
              help: "They start playing from the next round.",
            },
            {
              key: "reactions",
              label: "Let the room react",
              help: "A little applause goes a long way.",
            },
            {
              key: "autoAdvance",
              label: "Keep the party moving",
              help: "Automatically move on after results.",
            },
          ].map((t) => (
            <label className="toggle-row" key={t.key}>
              <span>
                <b>{t.label}</b>
                <small>{t.help}</small>
              </span>
              <input
                type="checkbox"
                checked={settings[t.key as "lateJoins"]}
                onChange={(e) => patch({ [t.key]: e.target.checked })}
              />
            </label>
          ))}
          <p className="safe-note">
            ✳ Anonymous voting. Work-friendly prompts. No self-votes.
            <br />
            Text has a basic safety filter. You can remove any player.
          </p>
        </div>
        <ErrorMessage message={party.error} />
        <button
          className="button full"
          disabled={busy || !settings.playlist.length}
        >
          {busy ? "Warming up the room…" : "Open the room"}
          <Icon name="arrow" />
        </button>
        <p className="form-footnote">
          2–30 players · Players join without accounts
        </p>
      </form>
    </div>
  );
}
export function Join() {
  const party = useParty(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [code, setCode] = useState(params.get("room")?.toUpperCase() ?? ""),
    [name, setName] = useState(""),
    [avatar, setAvatar] = useState(5),
    [busy, setBusy] = useState(false),
    [tried, setTried] = useState(false);
  const codeError = !/^[A-HJ-NP-Z2-9]{5}$/.test(code)
    ? "Enter the five-character code on the big screen."
    : "";
  const nameError =
    name.trim().length < 2
      ? "Use at least 2 characters."
      : name.trim().length > 18
        ? "Keep your name to 18 characters."
        : !/^[\p{L}\p{N} ._'-]+$/u.test(name.trim())
          ? "Use letters, numbers, spaces, or a simple nickname."
          : "";
  async function join(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (codeError || nameError) return;
    setBusy(true);
    const reply = await party.join(code, name.trim(), avatar);
    setBusy(false);
    if (reply.ok) navigate(`/room/${code}/play`);
  }
  return (
    <div className="join-page">
      <Link to="/" aria-label="Ruckus home">
        <Logo />
      </Link>
      <div className="join-heading">
        <Tag>YOUR NEW ALTER EGO AWAITS.</Tag>
        <h1>
          You’re one
          <br />
          of the <span>ruckus.</span>
        </h1>
        <p>No passwords. No small talk. Let’s get you in.</p>
      </div>
      <form onSubmit={join} className="join-form" noValidate>
        <label htmlFor="room-code">Room code</label>
        <input
          className="room-code-input"
          id="room-code"
          value={code}
          maxLength={5}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="J7KM5"
          aria-invalid={tried && !!codeError}
          aria-describedby="code-error"
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""));
            party.clearError();
          }}
        />
        {tried && codeError && (
          <p className="field-error" id="code-error">
            {codeError}
          </p>
        )}
        <label htmlFor="player-name">What should we call you?</label>
        <input
          id="player-name"
          maxLength={18}
          autoComplete="nickname"
          placeholder="Your name or excellent alias"
          value={name}
          aria-invalid={tried && !!nameError}
          aria-describedby="name-error"
          onChange={(e) => {
            setName(e.target.value);
            party.clearError();
          }}
        />
        {tried && nameError && (
          <p className="field-error" id="name-error">
            {nameError}
          </p>
        )}
        <fieldset className="avatar-fieldset">
          <legend>Pick your party face</legend>
          <div
            className="selected-avatar"
            style={{ background: AVATAR_COLORS[avatar] }}
          >
            <Avatar id={avatar} size={78} />
            <div>
              <b>{AVATAR_NAMES[avatar]}</b>
              <span>Your slightly more competitive self.</span>
            </div>
          </div>
          <div className="avatar-picker">
            {AVATAR_NAMES.map((label, id) => (
              <button
                type="button"
                key={id}
                aria-label={`Choose ${label}`}
                aria-pressed={avatar === id}
                className={avatar === id ? "selected" : ""}
                onClick={() => setAvatar(id)}
              >
                <Avatar id={id} size={48} />
              </button>
            ))}
          </div>
        </fieldset>
        <ErrorMessage message={party.error} />
        <button className="button full" disabled={busy}>
          {busy ? "Making your entrance…" : "I’m in. Let’s go."}
          <Icon name="arrow" />
        </button>
        <p className="form-footnote">
          By joining, you agree to keep it friendly.
        </p>
      </form>
    </div>
  );
}
