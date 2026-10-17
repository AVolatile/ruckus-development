import "./history.css";
import { DeleteRecap } from "./DeleteRecap";
import { useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { Link, useNavigate } from "../workspaces/navigation";
import { useWorkspace } from "../workspaces/context";
import { request } from "../lib/api";
import { Avatar, Tag, Icon } from "../components/Visuals";
import { StatusBadge } from "../app/StatusBadge";
import { download } from "../studio/transfer";
import {
  recapCsv,
  type SessionRecap,
  type SessionSegment,
} from "../../shared/history";
import { useHistoryRequest } from "./useHistoryRequest";
import {
  HistoryTabs,
  HistoryError,
  HistoryMark,
  dateLabel,
  durationLabel,
  identity,
} from "./HistoryParts";
export default function SessionRecap() {
  const { sessionId } = useParams(),
    { current } = useWorkspace(),
    base = `/api/v1/workspaces/${current.id}`,
    state = useHistoryRequest<SessionRecap>(`${base}/sessions/${sessionId}`),
    s = state.data,
    navigate = useNavigate();
  const [sourceError, setSourceError] = useState(""),
    [opening, setOpening] = useState(false);
  async function openSource() {
    if (!s) return;
    setOpening(true);
    setSourceError("");
    const event = s.source.eventId,
      board = s.source.boardId;
    try {
      if (event) {
        await request(`${base}/events/${event}`);
        navigate(`/app/events/${event}/preview`);
      } else if (board) {
        await request(`${base}/boards/${board}`);
        navigate(`/app/studio/boards/${board}/preview`);
      }
    } catch {
      setSourceError(
        "The current source isn’t available to you. This historical recap is still here.",
      );
    } finally {
      setOpening(false);
    }
  }
  const standings =
    s?.participants
      .filter((p) => p.finalRank !== null)
      .sort(
        (a, b) =>
          (a.finalOrder ?? a.finalRank!) - (b.finalOrder ?? b.finalRank!),
      ) ?? [];
  return (
    <section className="history-page session-recap">
      <Link className="history-back" to="/app/history">
        ← All sessions
      </Link>
      <HistoryTabs />
      {state.loading ? (
        <StatusBadge tone="saving">Opening the recap…</StatusBadge>
      ) : state.error ? (
        <HistoryError message={state.error} retry={state.reload} />
      ) : (
        s && (
          <>
            <header className="recap-intro">
              <div>
                <Tag>
                  {s.type.toUpperCase()} /{" "}
                  {s.status === "completed"
                    ? "THAT WAS A GOOD RUCKUS"
                    : "THE NIGHT ENDED EARLY"}
                </Tag>
                <h1>{s.title}</h1>
                <p>Here’s how the Ruckus went.</p>
                <time dateTime={s.startedAt}>
                  {dateLabel(s.startedAt)} · {s.startedAt.slice(11, 16)} UTC
                </time>
              </div>
              <HistoryMark source={s.source} type={s.type} />
            </header>
            <dl className="recap-facts">
              <div>
                <dt>In the room</dt>
                <dd>
                  {s.playerCountJoined}
                  <small>
                    joined{s.demoCount ? ` · ${s.demoCount} demo` : ""}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Time together</dt>
                <dd>{durationLabel(s.durationSeconds)}</dd>
              </div>
              <div>
                <dt>The lineup</dt>
                <dd>
                  {s.segments.length}
                  <small>
                    {s.segments.length === 1 ? "game" : "games"} played
                  </small>
                </dd>
              </div>
              <div>
                <dt>At the finish</dt>
                <dd>
                  {s.playerCountCompleted}
                  <small>
                    {s.status === "completed"
                      ? "participated and remained"
                      : "early end; no final completion"}
                  </small>
                </dd>
              </div>
            </dl>
            <section className="recap-outcome">
              <div>
                <span className="eyebrow">01 / THE COMPANY YOU KEPT</span>
                <h2>
                  {standings.length
                    ? "The final\npecking order."
                    : "Every opinion\ncounted."}
                </h2>
                <p>
                  {standings.length
                    ? s.type === "event"
                      ? "Event placement points at the finish. Equal totals share a rank."
                      : "Final game points and displayed places. Equal scores share the crown; the live scoreboard lists sequential places."
                    : "A good room doesn’t need a winner. This session has a participation recap, with no final scored leaderboard."}
                </p>
              </div>
              {standings.length ? (
                <ol className="recap-standings" aria-label="Final leaderboard">
                  {standings.map((p) => (
                    <li key={p.id} data-rank={p.finalRank}>
                      <span className="recap-rank">
                        {String(p.finalRank).padStart(2, "0")}
                      </span>
                      <Avatar id={p.avatar} size={44} />
                      <div>
                        <b>{p.name}</b>
                        <small>
                          {p.demo ? "Demo player · " : ""}
                          {p.completed
                            ? "Finished"
                            : s.status === "ended_early"
                              ? "Present at early end"
                              : "No completed round"}
                        </small>
                      </div>
                      <strong>
                        {p.finalScore?.toLocaleString()}
                        <small>points</small>
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <ul className="recap-attendance">
                  {s.participants.map((p) => (
                    <li key={p.id}>
                      <Avatar id={p.avatar} size={40} />
                      <b>{p.name}</b>
                      <small>
                        Played in {p.segmentsParticipated}{" "}
                        {p.segmentsParticipated === 1 ? "game" : "games"}
                        {p.demo ? " · demo" : ""}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {standings.length > 0 &&
              s.participants.some((p) => p.finalRank === null) && (
                <details className="recap-other-guests">
                  <summary>Other guests who joined</summary>
                  <ul>
                    {s.participants
                      .filter((p) => p.finalRank === null)
                      .map((p) => (
                        <li key={p.id}>
                          {p.name} · Played in {p.segmentsParticipated}{" "}
                          {p.segmentsParticipated === 1 ? "game" : "games"}
                          {p.demo ? " · demo" : ""}
                        </li>
                      ))}
                  </ul>
                  <p>
                    Removed players are retained as attendance, outside the
                    terminal leaderboard.
                  </p>
                </details>
              )}
            {s.detailsOmitted > 0 && (
              <p role="status">
                The attendance-detail limit was reached. {s.detailsOmitted}{" "}
                additional entries are counted without individual details.
              </p>
            )}
            <section className="recap-show">
              <div className="history-section-head">
                <span className="eyebrow">02 / HOW THE NIGHT UNFOLDED</span>
                <h2>A good run of show.</h2>
                <p>
                  The games actually played, in order. Skipped and unfinished
                  first rounds don’t appear.
                </p>
              </div>
              <ol>
                {s.segments.map((g) => (
                  <Segment key={g.sequence} segment={g} session={s} />
                ))}
              </ol>
            </section>
            <DeleteRecap id={s.id} />
            <section className="recap-next">
              <div>
                <span className="eyebrow">03 / KEEP THE GOOD GOING</span>
                <h2>
                  Same crew.
                  <br />
                  Another Ruckus?
                </h2>
                <p>
                  This recap is frozen. Opening a source uses its current saved
                  version and current permissions.
                </p>
                {s.brand && (
                  <p>
                    Presented with {s.brand.displayName} × Ruckus ·{" "}
                    {s.brand.name}. Historical colors and identity are retained;
                    private images aren’t copied into this recap.
                  </p>
                )}
                <details className="recap-provenance">
                  <summary>Snapshot provenance</summary>
                  {s.source.eventRevisionId && (
                    <p>
                      Event revision <code>{s.source.eventRevisionId}</code>
                    </p>
                  )}
                  {s.brand && (
                    <p>
                      Brand revision <code>{s.brand.revisionId}</code>
                    </p>
                  )}
                  <p>
                    Launch format {s.launchSnapshotVersion} · session{" "}
                    <code>{s.id}</code>
                  </p>
                </details>
              </div>
              <div className="recap-actions">
                <button
                  className="button"
                  onClick={() =>
                    download(
                      `ruckus-${s.id}-recap.csv`,
                      recapCsv(s),
                      "text/csv",
                    )
                  }
                >
                  Export recap CSV ↗
                </button>
                {(s.source.eventId || s.source.boardId) && (
                  <button
                    className="button outline"
                    disabled={opening}
                    onClick={() => void openSource()}
                  >
                    {opening ? "Checking source…" : "Open current source ↗"}
                  </button>
                )}
                <Link className="text-button" to="/app/originals">
                  Find your next Original ↗
                </Link>
                {sourceError && <p role="alert">{sourceError}</p>}
              </div>
            </section>
            <p className="history-footnote">
              Session-local display names and aggregate outcomes. No player
              accounts, creative submissions or drawings. Room {s.roomCode} is a
              historical label, not an active invitation.
            </p>
          </>
        )
      )}
    </section>
  );
}
function Segment({
  segment: g,
  session: s,
}: {
  segment: SessionSegment;
  session: SessionRecap;
}) {
  const winners =
    g.scored && g.completed
      ? g.results
          .filter(
            (r) =>
              r.rank !== null &&
              r.score !== null &&
              r.score > 0 &&
              r.score === Math.max(...g.results.map((r) => r.score ?? 0)),
          )
          .map(
            (r) => s.participants.find((p) => p.id === r.participantId)?.name,
          )
          .filter(Boolean)
      : [];
  const theme = identity(g.source, g.type);
  return (
    <li
      className="recap-segment"
      style={{ "--history-accent": theme.color } as CSSProperties}
    >
      <div className="recap-segment-number">
        {String(g.sequence + 1).padStart(2, "0")}
        <Icon name={theme.icon} />
      </div>
      <div>
        <span className="eyebrow">
          {g.type} / {g.completed ? "FINISHED" : "ENDED EARLY"}
        </span>
        <h3>{g.title}</h3>
        <p>
          {g.rounds} {g.rounds === 1 ? "round" : "rounds"} ·{" "}
          {g.participantCount} participants · {durationLabel(g.durationSeconds)}
        </p>
        <p>
          {g.submissions} submissions · {g.votes} votes
          {g.results.some((r) => r.correct > 0)
            ? ` · ${g.results.reduce((n, r) => n + r.correct, 0)} ${g.source.gameType === "room-temperature" ? "majority responses" : "correct responses"}`
            : ""}
        </p>
        {winners.length > 0 && (
          <p>
            <b>{winners.length > 1 ? "Shared top score" : "Top score"}:</b>{" "}
            {winners.join(", ")}
          </p>
        )}
        {!g.scored && <p>No score. Every response counted.</p>}
        <details className="recap-provenance">
          <summary>Content used</summary>
          <p>
            {g.source.packName ??
              (g.source.boardId
                ? "Saved Studio board"
                : "Portable Studio content")}
          </p>
          {g.source.packRevisionId && (
            <p>
              Pack revision <code>{g.source.packRevisionId}</code>
            </p>
          )}
          {g.source.boardRevisionId && (
            <p>
              Board revision <code>{g.source.boardRevisionId}</code>
            </p>
          )}
          {!g.source.packRevisionId && !g.source.boardRevisionId && (
            <p>No verified cloud revision reference was supplied.</p>
          )}
        </details>
      </div>
    </li>
  );
}
