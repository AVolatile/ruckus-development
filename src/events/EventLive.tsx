import { HistorySaved } from "../history/HistorySaved";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RoomView } from "../../shared/types";
import { readableForeground } from "../../shared/brand";
import { useParty } from "../lib/party";
import { Avatar, Logo } from "../components/Visuals";
import { JoinQR, Scoreboard } from "../components/RoomParts";
import { BoardSummary } from "../components/studio/BoardSummary";
export function EventFrame({
  room,
  children,
}: {
  room: RoomView;
  children: ReactNode;
}) {
  const brand = room.event?.brand;
  const style = {
    "--event-primary": brand?.primary ?? "#2548F4",
    "--event-on-primary": readableForeground(brand?.primary ?? "#2548F4"),
    "--event-surface": brand?.surface ?? "#F9F7ED",
    "--event-on-surface": readableForeground(brand?.surface ?? "#F9F7ED"),
    "--event-accent": brand?.accent ?? "#F6ED51",
    "--event-on-accent": readableForeground(brand?.accent ?? "#F6ED51"),
  } as CSSProperties;
  return (
    <div className="event-live" style={style}>
      {brand?.background && (
        <img className="event-live-background" src={brand.background} alt="" />
      )}
      <div className="event-live-content">
        {children}
        {room.history && <HistorySaved room={room} />}
        <footer className="event-attribution">
          {brand?.footer && <span>{brand.footer}</span>}
          <span>Powered by Ruckus</span>
        </footer>
      </div>
    </div>
  );
}
export function EventBanner({
  room,
  host = false,
}: {
  room: RoomView;
  host?: boolean;
}) {
  const e = room.event!;
  return (
    <div
      className="event-banner"
      style={{
        background: e.brand?.surface ?? "#F9F7ED",
        color: readableForeground(e.brand?.surface ?? "#F9F7ED"),
      }}
    >
      <div>
        {e.brand?.logo && (
          <img src={e.brand.logo} alt={`${e.brand.displayName} logo`} />
        )}
        <b>{e.title}</b>
      </div>
      <span>
        Segment {e.segmentIndex + 1} / {e.playlist.length} ·{" "}
        {e.playlist[e.segmentIndex].title}
      </span>
      {host && (
        <span>
          {room.players.filter((p) => p.connected).length} connected ·{" "}
          {
            e.playlist.slice(e.segmentIndex + 1).filter((p) => !p.skipped)
              .length
          }{" "}
          upcoming{e.hostNote ? ` · Host note: ${e.hostNote}` : ""}
        </span>
      )}
      <small>Powered by Ruckus</small>
    </div>
  );
}
function EventLeaderboard({ room }: { room: RoomView }) {
  const e = room.event!;
  return (
    <section className="event-leaderboard" aria-label="Event leaderboard">
      <h2>The whole event, together.</h2>
      <p>
        Placement points · 0–1,000 per scored segment · equal scores share
        points
      </p>
      <ol>
        {e.scores.map((s, i) => {
          const p = room.players.find((p) => p.id === s.playerId)!;
          const rank = e.scores.findIndex((a) => a.points === s.points) + 1;
          return (
            <li key={s.playerId}>
              <span>#{rank}</span>
              <Avatar id={p.avatar} size={40} />
              <b>
                {p.name}
                {p.id === room.you ? " (you)" : ""}
              </b>
              <strong>
                {s.points.toLocaleString()}
                <small>
                  {s.segments} scored{" "}
                  {s.segments === 1 ? "segment" : "segments"}
                </small>
              </strong>
              {i === 0 && s.points > 0 && (
                <span className="sr-only">Leading the event</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
export function EventLive({
  room,
  host = false,
}: {
  room: RoomView;
  host?: boolean;
}) {
  const party = useParty(),
    e = room.event!,
    [ending, setEnding] = useState(false),
    [pending, setPending] = useState(false);
  const current = e.playlist[e.segmentIndex],
    next = e.playlist.slice(e.segmentIndex + 1).find((p) => !p.skipped);
  const aggregate =
    e.settings.carryScoresAcrossGames &&
    (e.state !== "EVENT_FINAL" || e.settings.showFinalEventLeaderboard);
  async function command(action: Parameters<typeof party.eventAction>[0]) {
    setPending(true);
    try {
      await party.eventAction(action);
    } finally {
      setPending(false);
    }
  }
  const winners =
    e.scores.length && e.scores[0].points > 0
      ? e.scores
          .filter((s) => s.points === e.scores[0].points)
          .map((s) => room.players.find((p) => p.id === s.playerId)!)
      : [];
  const heading =
    e.state === "LOBBY"
      ? e.title
      : e.state === "EVENT_INTRO"
        ? e.title
        : e.state === "SEGMENT_INTRO"
          ? current.title
          : e.state === "GAME_RESULTS"
            ? `${current.title}: that’s a wrap.`
            : e.state === "INTERMISSION"
              ? "A little room to breathe."
              : e.state === "EVENT_FINAL"
                ? "That was a good Ruckus."
                : "Good Ruckus. See you next time.";
  return (
    <EventFrame room={room}>
      <header className="event-live-header">
        <Logo />
        {e.brand && (
          <span>
            {e.brand.logo && (
              <img src={e.brand.logo} alt={`${e.brand.displayName} logo`} />
            )}
            <b>{e.brand.displayName}</b>
          </span>
        )}
        <span>
          ROOM <strong>{room.code}</strong>
        </span>
      </header>
      <EventBanner room={room} host={host} />
      {!party.connected && (
        <p className="event-feedback" role="status">
          Reconnecting… Your place in the event is saved while this server is
          available.
        </p>
      )}
      {!room.hostConnected && !host && e.state !== "ENDED" && (
        <p role="status">The host is reconnecting. Stay here.</p>
      )}
      <main
        className={`event-live-grid ${host && e.state === "LOBBY" ? "with-qr" : ""}`}
      >
        <section className="event-live-panel">
          <span className="eyebrow">
            {
              {
                LOBBY: "THE ROOM IS GETTING TOGETHER",
                EVENT_INTRO: "ONE ROOM. YOUR PEOPLE.",
                SEGMENT_INTRO: "NEXT UP",
                GAME_ACTIVE: "LET’S PLAY",
                GAME_RESULTS: "GAME COMPLETE",
                INTERMISSION: "A BREATHER BETWEEN GAMES",
                EVENT_FINAL: "ONE VERY GOOD FINALE",
                ENDED: "THANKS FOR BRINGING THE RUCKUS",
              }[e.state]
            }
          </span>
          <h1 aria-live="polite">{heading}</h1>
          {e.state === "LOBBY" && (
            <>
              {e.subtitle && <p>{e.subtitle}</p>}
              <p>
                {host
                  ? "One code. The whole lineup. Bring the room together."
                  : "You’re in. Keep this controller open for every game."}
              </p>
              <div className="event-live-players">
                {room.players.map((p) => (
                  <div key={p.id}>
                    <Avatar id={p.avatar} size={64} />
                    <b>{p.name}</b>
                    <small>{p.connected ? "Ready" : "Reconnecting"}</small>
                    {host && (
                      <button
                        onClick={() =>
                          void party.action("remove", undefined, p.id)
                        }
                        aria-label={`Remove ${p.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!room.players.length && (
                <p>Your first guest is one scan away.</p>
              )}
            </>
          )}
          {e.state === "EVENT_INTRO" && <p>{e.presentation.introMessage}</p>}
          {e.state === "SEGMENT_INTRO" && (
            <>
              <p>
                {current.transitionLabel ||
                  (host
                    ? "The same audience. A fresh game. Start when the room is ready."
                    : "Look up. Your host is introducing the next game.")}
              </p>
              <p>
                {room.board
                  ? `${room.board.questionCount} Studio questions`
                  : `${room.settings.rounds} rounds`}{" "}
                · Your controller will open automatically.
              </p>
            </>
          )}
          {e.state === "GAME_RESULTS" && (
            <>
              <p>
                Game points stay with this game. Event placement points carry
                the night.
              </p>
              <Scoreboard players={room.players} compact />
              <BoardSummary room={room} />
            </>
          )}
          {e.state === "INTERMISSION" && (
            <>
              <p>{e.presentation.intermissionMessage}</p>
              <p>
                {next ? `Next up: ${next.title}` : "Your event finale is next."}
              </p>
            </>
          )}
          {e.state === "EVENT_FINAL" && (
            <>
              <p>{e.presentation.finalMessage}</p>
              {aggregate && winners.length > 0 && (
                <div className="event-winners">
                  <div>
                    {winners.slice(0, 6).map((p) => (
                      <Avatar key={p.id} id={p.avatar} size={80} />
                    ))}
                  </div>
                  <h2>{winners.map((p) => p.name).join(" & ")}</h2>
                  <p>
                    {winners.length > 1
                      ? "A shared crown."
                      : "Made the most Ruckus."}{" "}
                    {e.scores[0].points.toLocaleString()} event points.
                  </p>
                </div>
              )}
              {!aggregate && <p>Great company. Every game was part of it.</p>}
            </>
          )}
          {e.state === "ENDED" && (
            <p>The host closed this event. Thanks for bringing the Ruckus.</p>
          )}
          {host && !["ENDED", "EVENT_FINAL"].includes(e.state) && (
            <div className="event-actions">
              <button
                className="button"
                disabled={
                  pending ||
                  !party.connected ||
                  (e.state === "LOBBY" && room.players.length < 2)
                }
                onClick={() =>
                  void command(e.state === "LOBBY" ? "start" : "advance")
                }
              >
                {e.state === "LOBBY"
                  ? "Start event"
                  : e.state === "SEGMENT_INTRO"
                    ? "Start game"
                    : e.state === "GAME_RESULTS"
                      ? next
                        ? "Continue event"
                        : "Show event finale"
                      : e.state === "INTERMISSION"
                        ? next
                          ? "Introduce next game"
                          : "Show event finale"
                        : "Introduce first game"}{" "}
                →
              </button>
              {["GAME_RESULTS", "INTERMISSION", "SEGMENT_INTRO"].includes(
                e.state,
              ) &&
                next && (
                  <button
                    className="button outline"
                    disabled={pending}
                    onClick={() => void command("skip-next")}
                  >
                    Skip upcoming: {next.title}
                  </button>
                )}
            </div>
          )}
          {!host && !["ENDED", "EVENT_FINAL"].includes(e.state) && (
            <p className="waiting-note" role="status">
              Stay here. Your host will get things moving.
            </p>
          )}
          {host && e.state === "LOBBY" && (
            <div className="event-actions">
              <button
                className="button outline"
                onClick={() => void party.action("bots", 4)}
              >
                Add 4 demo players
              </button>
              <button
                className="button outline"
                onClick={() => void party.action("lock")}
              >
                {room.locked ? "Unlock joins" : "Lock joins"}
              </button>
            </div>
          )}
          {host && ["EVENT_FINAL", "ENDED"].includes(e.state) && (
            <Link className="button" to={`/app/w/${e.workspaceId}/events`}>
              Back to workspace events ↗
            </Link>
          )}
          {!host && e.state === "ENDED" && (
            <Link className="button" to="/join">
              Join another room
            </Link>
          )}
        </section>
        {host && e.state === "LOBBY" && (
          <JoinQR url={room.joinUrl} code={room.code} />
        )}
      </main>
      {aggregate &&
        ["GAME_RESULTS", "INTERMISSION", "EVENT_FINAL"].includes(e.state) && (
          <EventLeaderboard room={room} />
        )}
      {!["ENDED", "EVENT_FINAL"].includes(e.state) && (
        <section className="event-live-panel event-lineup">
          <h2>The lineup</h2>
          <ol>
            {e.playlist.map((p, i) => (
              <li
                key={p.itemId}
                aria-current={i === e.segmentIndex ? "step" : undefined}
              >
                <b>
                  {i + 1}. {p.title}
                </b>
                <span>
                  {p.skipped
                    ? "Skipped"
                    : i < e.segmentIndex
                      ? "Complete"
                      : i === e.segmentIndex
                        ? "Current"
                        : "Upcoming"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {host && e.problem && (
        <p className="event-feedback" role="alert">
          {e.problem.message} Reference: {e.problem.requestId}
        </p>
      )}
      {party.error && (
        <p className="event-feedback" role="alert">
          {party.error} <button onClick={party.clearError}>Dismiss</button>
        </p>
      )}
      {host && e.state !== "ENDED" && (
        <div className="event-end">
          <button className="button outline" onClick={() => setEnding(true)}>
            End event
          </button>
          {ending && (
            <div className="event-feedback">
              <h2>End the event for everyone?</h2>
              <p>
                The room closes and cannot be resumed. Current scores live only
                on this server.
              </p>
              <button
                className="button danger"
                disabled={pending}
                onClick={() => {
                  void command("end");
                  setEnding(false);
                }}
              >
                Confirm end event
              </button>{" "}
              <button
                className="button outline"
                onClick={() => setEnding(false)}
              >
                Keep playing
              </button>
            </div>
          )}
        </div>
      )}
    </EventFrame>
  );
}
