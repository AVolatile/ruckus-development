import { HistorySaved } from "../history/HistorySaved";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { gameById, gameForRoom } from "../../shared/catalog";
import { useParty } from "../lib/party";
import { useLiveAudio } from "../audio/AudioContext";
import { Avatar, Confetti, Icon, Logo, Star, Tag } from "../components/Visuals";
import { Awards, JoinQR, Scoreboard, Timer } from "../components/RoomParts";
import { HostGallery } from "../components/HostGallery";
import { ErrorMessage } from "../components/Layout";
import { BoardSummary } from "../components/studio/BoardSummary";
import { RoundReveal } from "../components/RoundReveal";
import { EventLive, EventBanner } from "../events/EventLive";
export function HostRoom() {
  const party = useParty(),
    { code } = useParams(),
    room = party.room;
  const audio = useLiveAudio();
  const [drawer, setDrawer] = useState(false),
    [ending, setEnding] = useState(false);
  useEffect(() => {
    if (!ending) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleModalKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEnding(false);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".confirm-modal button"),
      );
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleModalKey);
    return () => {
      document.removeEventListener("keydown", handleModalKey);
      previouslyFocused?.focus();
    };
  }, [ending]);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input,textarea,select,button") ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key.toLowerCase() === "m") {
        audio.toggleMute();
        return;
      }
      if (room?.event && room.event.state !== "GAME_ACTIVE") return;
      if (e.key === " ") {
        e.preventDefault();
        void party.action(room?.phase === "lobby" ? "start" : "next");
      }
      if (e.key.toLowerCase() === "p") void party.action("pause");
      if (e.key.toLowerCase() === "f") fullscreen();
      if (e.key.toLowerCase() === "h") setDrawer((d) => !d);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [party, room?.phase, room?.event, fullscreen, audio]);
  if (!room || room.code !== code || party.identity?.role !== "host")
    return (
      <div className="room-recovery">
        <Logo />
        <h1>
          {party.error ? "That stage isn’t available." : "Finding your stage…"}
        </h1>
        <p>
          Your host key is saved in this browser tab. Reopen the original host
          tab to control this room.
        </p>
        <ErrorMessage message={party.error} />
        <Link className="button" to="/app/host">
          Open a new room <Icon name="arrow" />
        </Link>
      </div>
    );
  if (room.event && room.event.state !== "GAME_ACTIVE")
    return <EventLive room={room} host />;
  const game = gameForRoom(room);
  const nextGame = gameById(
    room.settings.playlist[room.gameIndex + 1] ?? game.id,
  );
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const answered = room.players.filter((p) =>
    room.phase === "voting" ? p.voted : p.submitted,
  ).length;
  return (
    <div
      className={`host-screen phase-${room.phase}`}
      style={{ "--game-color": game.color } as React.CSSProperties}
    >
      {room.event && <EventBanner room={room} host />}
      <header className="host-header">
        <Link to="/app" aria-label="Ruckus host home">
          <Logo light />
        </Link>
        <div className="host-breadcrumb">
          {room.phase === "lobby"
            ? "THE ROOM BEFORE THE STORM"
            : room.phase === "final"
              ? "THAT WAS A GOOD RUCKUS."
              : game.name.toUpperCase()}
          <span>
            {room.phase !== "lobby" && room.phase !== "final"
              ? `GAME ${room.gameIndex + 1} / ${room.settings.playlist.length} · ROUND ${room.round + 1} / ${room.board?.questionCount ?? room.settings.rounds}`
              : `${room.players.length} / 30 PLAYERS`}
          </span>
        </div>
        <div className="host-code">
          <small>JOIN AT THE QR</small>
          <b>{room.code}</b>
        </div>
      </header>
      {!party.connected && (
        <div className="connection-banner" role="status">
          Connection dropped. Reconnecting to your room…
        </div>
      )}
      <div className="host-body">
        {room.phase === "lobby" && (
          <div className="host-lobby">
            <div className="lobby-main">
              <Tag color="#f6ed51">
                YOU BRING THE PEOPLE. WE BRING THE RUCKUS.
              </Tag>
              <h1>
                Look who
                <br />
                showed up.
                <Star />
              </h1>
              <p className="lobby-subtitle">Phones out. Game faces on.</p>
              <div
                className="lobby-players"
                aria-live="polite"
                role="region"
                aria-label="Players in the room"
                tabIndex={0}
              >
                {room.players.map((p) => (
                  <div
                    className={`lobby-player ${!p.connected ? "disconnected" : ""}`}
                    key={p.id}
                  >
                    <Avatar id={p.avatar} size={100} />
                    <b>{p.name}</b>
                    <small>
                      {p.bot
                        ? "DEMO CREW"
                        : p.connected
                          ? "READY TO RUCKUS"
                          : "RECONNECTING"}
                    </small>
                  </div>
                ))}
                {!room.players.length && (
                  <div className="empty-lobby">
                    <Avatar id={2} size={100} />
                    <p>
                      A room full of potential.
                      <br />
                      Scan the code to make an entrance.
                    </p>
                  </div>
                )}
              </div>
              <div className="lobby-lineup">
                {(room.board
                  ? ["hotwire" as const]
                  : room.settings.playlist
                ).map((id, i) => (
                  <span key={`${id}-${i}`}>
                    <b>0{i + 1}</b> {room.board?.title ?? gameById(id).name}
                  </span>
                ))}
              </div>
              <div className="lobby-actions">
                <button
                  className="button yellow"
                  disabled={room.players.length < 2 || !party.connected}
                  onClick={() => void party.action("start")}
                >
                  Let’s make a ruckus <Icon name="arrow" />
                </button>
                <div className="bot-actions">
                  <span>Flying solo? Invite the demo crew.</span>
                  <div>
                    {[4, 8, 12].map((n) => (
                      <button
                        key={n}
                        onClick={() => void party.action("bots", n)}
                        disabled={room.players.length >= 30}
                      >
                        + {n} demo players
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {room.players.length < 2 && (
                <p className="lobby-min">
                  Two players make a party. Demo players count.
                </p>
              )}
            </div>
            <JoinQR url={room.joinUrl} code={room.code} />
          </div>
        )}
        {room.phase === "intro" && (
          <div className="game-intro">
            <Tag color={game.color}>
              NEXT UP / {String(room.gameIndex + 1).padStart(2, "0")}
            </Tag>
            <Icon name={game.icon} />
            <h1>{game.name}</h1>
            <p>{game.rule}</p>
            <span className="intro-rule">
              {game.id === "scribble-shift"
                ? "Draw on your phone. Talent optional."
                : game.category === "creative"
                  ? "Anonymous submissions. No self-votes."
                  : "Answers stay on your phone until the reveal."}
            </span>
            <Timer room={room} />
            <button
              className="button yellow"
              onClick={() => void party.action("next")}
            >
              We’re ready <Icon name="arrow" />
            </button>
          </div>
        )}
        {room.phase === "active" && (
          <div
            className={`host-round ${game.category === "creative" ? "creative-round" : ""}`}
          >
            <div className="round-prompt">
              <Tag color={game.color}>{game.short.toUpperCase()}</Tag>
              <h1>{room.prompt?.title}</h1>
              {room.prompt?.scene !== undefined && (
                <img
                  className="caption-scene"
                  src={`/scenes/${room.prompt.scene}.svg`}
                  alt={room.prompt.title}
                />
              )}{" "}
              {room.prompt?.options && (
                <div className="host-options">
                  {room.prompt.options.map((a, i) => (
                    <div key={a}>
                      <span>{"ABCDEF"[i]}</span>
                      <b>{a}</b>
                    </div>
                  ))}
                </div>
              )}
              <div className="round-response">
                <div className="response-progress">
                  <i
                    style={{
                      width: `${(answered / Math.max(1, room.players.filter((p) => p.connected).length)) * 100}%`,
                    }}
                  />
                </div>
                <span>
                  {answered} answers in · {room.players.length} players
                </span>
                <p>
                  {game.category === "creative"
                    ? "Your masterpiece belongs on your phone."
                    : "Tap your answer on your phone."}
                </p>
              </div>
            </div>
            <Timer room={room} />
          </div>
        )}
        {room.phase === "voting" && (
          <div className="host-voting">
            <div className="voting-heading">
              <div>
                <Tag color={game.color}>GIVE SOMEONE THE SPOTLIGHT.</Tag>
                <h1>Pick your favorite.</h1>
                <p>{answered} votes in. Cast yours on your phone.</p>
              </div>
              <Timer room={room} />
            </div>
            <HostGallery submissions={room.submissions} key={room.roundKey} />
          </div>
        )}
        {room.phase === "results" && (
          <>
            <RoundReveal room={room} />
            <div
              className="round-leaders"
              hidden={room.showLeaderboard === false}
            >
              {sorted.slice(0, 5).map((p, i) => (
                <div key={p.id}>
                  <span>#{i + 1}</span>
                  <Avatar id={p.avatar} size={45} />
                  <b>{p.name}</b>
                  <strong>{p.score.toLocaleString()}</strong>
                  {p.delta > 0 && <small>+{p.delta}</small>}
                </div>
              ))}
            </div>
          </>
        )}
        {room.phase === "intermission" && (
          <div className="intermission">
            <div>
              <Tag color="#f6ed51">TAKE A BREATH. TALK SOME TRASH. NICELY.</Tag>
              <h1>
                The plot
                <br />
                thickens.
              </h1>
              <p>
                Next: <b>{nextGame.name}</b>
                <br />
                {nextGame.short}
              </p>
              <Timer room={room} />
            </div>
            <Scoreboard players={room.players} />
          </div>
        )}
        {room.phase === "final" && (
          <div className="final-screen">
            <Confetti />
            <Tag color="#f6ed51">
              {room.board?.scoring === false
                ? "STRONG OPINIONS. GREAT COMPANY."
                : "OFFICIALLY THE PERSON TO BEAT."}
            </Tag>
            {room.board?.scoring === false && (
              <>
                <h1>Every opinion counted.</h1>
                <p>A good room doesn’t need a winner.</p>
                <div className="lobby-players">
                  {room.players.map((p) => (
                    <div className="lobby-player" key={p.id}>
                      <Avatar id={p.avatar} size={64} />
                      <b>{p.name}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
            {winner && room.board?.scoring !== false && (
              <>
                <div className="winner-avatar">
                  <Star />
                  <Avatar id={winner.avatar} size={180} />
                </div>
                <h1>
                  {winner.name}
                  <span>made the most ruckus.</span>
                </h1>
                <p className="winner-points">
                  {winner.score.toLocaleString()} points. Unlimited bragging
                  rights.
                  {sorted.filter((p) => p.score === winner.score).length >
                    1 && (
                    <span className="tie-note">
                      {" "}
                      A shared crown:{" "}
                      {sorted
                        .filter((p) => p.score === winner.score)
                        .map((p) => p.name)
                        .join(", ")}
                      .
                    </span>
                  )}
                </p>
              </>
            )}
            {room.board?.scoring !== false && <Awards room={room} />}
            <BoardSummary room={room} />
            <HistorySaved room={room} />
            <div className="session-stats">
              <span>
                <b>{room.stats.rounds}</b> rounds
              </span>
              <span>
                <b>{room.stats.answers}</b> submissions
              </span>
              <span>
                <b>{room.stats.reactions}</b> reactions
              </span>
            </div>
            <div className="final-actions">
              <button
                className="button yellow"
                onClick={() => void party.action("rematch")}
              >
                Same crew. Rematch. <Icon name="arrow" />
              </button>
              <Link className="button light-outline" to="/app/host">
                New lineup
              </Link>
            </div>
            <Scoreboard players={room.players} />
          </div>
        )}
        {room.phase === "ended" && (
          <div className="game-intro">
            <Avatar id={19} size={150} />
            <h1>Good ruckus.</h1>
            <p>The host ended the room. The bragging rights live on.</p>
            <Link to="/app/host" className="button yellow">
              Open a fresh room <Icon name="arrow" />
            </Link>
          </div>
        )}
      </div>
      <div className="host-reactions" aria-live="polite">
        {party.reactions.map((r) => (
          <div key={r.id}>
            {r.emoji}
            <small>{r.name}</small>
          </div>
        ))}
      </div>
      <div className="host-toolbar">
        <span>
          <i className={`live-dot ${party.connected ? "" : "offline"}`} />
          {party.connected ? "LIVE ROOM" : "RECONNECTING"}
        </span>
        {!["lobby", "final", "ended"].includes(room.phase) && (
          <>
            <button onClick={() => void party.action("next")}>
              {room.phase === "active"
                ? "Close round"
                : room.phase === "voting"
                  ? "Reveal votes"
                  : "Next"}{" "}
              →
            </button>
            <button
              disabled={!room.deadline}
              onClick={() => void party.action("pause")}
            >
              {room.paused ? "Resume" : "Pause"} <kbd>P</kbd>
            </button>
          </>
        )}
        <button onClick={fullscreen}>
          Full screen <kbd>F</kbd>
        </button>
        <button onClick={() => setDrawer((v) => !v)} aria-expanded={drawer}>
          Host controls <kbd>H</kbd>
        </button>
      </div>
      <div className="host-error">
        <ErrorMessage message={party.error} />
        {party.error && (
          <button onClick={party.clearError} aria-label="Dismiss message">
            ×
          </button>
        )}
      </div>
      {drawer && (
        <aside className="host-drawer">
          <button
            className="drawer-close"
            onClick={() => setDrawer(false)}
            aria-label="Close host controls"
          >
            ×
          </button>
          <h2>
            Your house.
            <br />
            Your rules.
          </h2>
          <button
            className="button outline full"
            onClick={() => void party.action("lock")}
          >
            {room.locked ? "Unlock room" : "Lock room"}{" "}
            {room.locked ? "🔒" : "↗"}
          </button>
          <p>
            {room.locked
              ? "New joins are blocked. Existing players can reconnect."
              : "New arrivals can join under your room’s join rules."}
          </p>
          <a
            href={`/join?room=${room.code}`}
            target="_blank"
            rel="noreferrer"
            className="button outline full"
          >
            Join as a player ↗
          </a>
          <p>Opens a separate controller tab. Your host stays here.</p>
          <h3>The guest list</h3>
          <div className="guest-list">
            {room.players.map((p) => (
              <div key={p.id}>
                <Avatar id={p.avatar} size={35} />
                <b>{p.name}</b>
                <button
                  onClick={() => void party.action("remove", undefined, p.id)}
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            className="button danger full"
            onClick={() => setEnding(true)}
          >
            End this room
          </button>
          <p className="keyboard-help">
            Space: next · P: pause · F: full screen
            <br />
            M: sound · H: controls
          </p>
        </aside>
      )}
      {ending && (
        <div className="modal-backdrop">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
          >
            <h2 id="end-title">Call it a good ruckus?</h2>
            <p>This ends the room for everyone. Scores won’t be saved.</p>
            <button
              className="button danger"
              autoFocus
              onClick={() => {
                if (room.event) void party.eventAction("end");
                else void party.action("end");
                setEnding(false);
                setDrawer(false);
              }}
            >
              End room
            </button>
            <button className="button outline" onClick={() => setEnding(false)}>
              Keep playing
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
