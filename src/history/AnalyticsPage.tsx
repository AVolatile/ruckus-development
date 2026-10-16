import "./history.css";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../workspaces/context";
import { Link } from "../workspaces/navigation";
import { Tag, Icon } from "../components/Visuals";
import { StatusBadge } from "../app/StatusBadge";
import { gameById } from "../../shared/catalog";
import type { GameId } from "../../shared/types";
import type { AnalyticsSummary } from "../../shared/history";
import { useHistoryRequest } from "./useHistoryRequest";
import {
  HistoryTabs,
  HistoryFilters,
  HistoryError,
  HistoryEmpty,
  durationLabel,
  historyQuery,
} from "./HistoryParts";
export default function AnalyticsPage() {
  const { current } = useWorkspace(),
    [params] = useSearchParams(),
    selection = historyQuery(params, true).toString(),
    state = useHistoryRequest<AnalyticsSummary>(
      `/api/v1/workspaces/${current.id}/analytics/summary?${selection}`,
    ),
    s = state.data;
  return (
    <section className="history-page analytics-page">
      <header className="analytics-intro">
        <Tag>HISTORY / THE BIGGER PICTURE</Tag>
        <h1>
          Your Ruckus,
          <br />
          <span>lately.</span>
        </h1>
        <p>
          A little perspective on the occasions you’ve made. Real play, kept
          simple.
        </p>
      </header>
      <HistoryTabs analytics />
      <HistoryFilters analytics />
      {state.loading ? (
        <StatusBadge tone="saving">Loading your Ruckus…</StatusBadge>
      ) : state.error ? (
        <HistoryError message={state.error} retry={state.reload} />
      ) : s && !s.sessions ? (
        <HistoryEmpty filtered={params.size > 0} />
      ) : (
        s && (
          <>
            <div className="analytics-lead">
              <strong>{s.sessions.toLocaleString()}</strong>
              <div>
                <h2>
                  {s.sessions === 1 ? "occasion" : "occasions"} worth
                  <br />
                  getting together.
                </h2>
                <p>
                  {s.attendances.toLocaleString()} participant attendances ·{" "}
                  {durationLabel(s.totalSeconds)} of play.
                </p>
                <small>
                  {s.demoAttendances > 0
                    ? `${s.demoAttendances} attendances were demo players. `
                    : ""}
                  A returning guest counts again in each session.
                </small>
              </div>
              <Icon name="asterisk" />
            </div>
            <section className="analytics-rhythm">
              <div className="history-section-head">
                <span className="eyebrow">01 / WHEN THE ROOM GOT LOUD</span>
                <h2>A rhythm of your own.</h2>
                <p>
                  Sessions by UTC {s.bucket}.{" "}
                  {s.bucket === "month"
                    ? "Latest 120 months with play"
                    : "Latest 120 days with play"}
                  ; periods without play are omitted.
                </p>
              </div>
              <figure>
                <ol
                  className="activity-strip"
                  aria-label={`Sessions by ${s.bucket}`}
                >
                  {s.activity.map((a) => (
                    <li key={a.date}>
                      <span
                        className="activity-bar"
                        style={{
                          height: `${Math.max(3, (a.sessions / Math.max(...s.activity.map((v) => v.sessions))) * 110)}px`,
                        }}
                        aria-hidden="true"
                      />
                      <b>{a.sessions}</b>
                      <time dateTime={a.date}>
                        {s.bucket === "month" ? a.date.slice(0, 7) : a.date}
                      </time>
                      <span className="sr-only">
                        {a.attendances} attendances
                      </span>
                    </li>
                  ))}
                </ol>
                <figcaption>
                  Height shows session count. The number and date are printed
                  for every period.
                </figcaption>
              </figure>
            </section>
            <div className="analytics-playing">
              <section>
                <span className="eyebrow">02 / THE REPEAT OFFENDERS</span>
                <h2>
                  What you came
                  <br />
                  back to play.
                </h2>
                {s.games.length ? (
                  <ol className="analytics-game-lineup">
                    {s.games.map((g) => {
                      const game = gameById(g.id as GameId);
                      return (
                        <li key={g.id}>
                          <span
                            style={{ background: game.color }}
                            aria-hidden="true"
                          >
                            <Icon name={game.icon} />
                          </span>
                          <div>
                            <h3>{game.name}</h3>
                            <p>
                              {g.plays} {g.plays === 1 ? "segment" : "segments"}{" "}
                              played
                            </p>
                          </div>
                          <Link to={sessionsLink(selection, "game", g.id)}>
                            See sessions ↗
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p>
                    Studio ran the show in this selection. No Original segments
                    were played.
                  </p>
                )}
              </section>
              <aside className="analytics-notes">
                <span className="eyebrow">A FEW THINGS TO TAKE WITH YOU</span>
                <dl>
                  <div>
                    <dt>Average attendance</dt>
                    <dd>
                      {s.averageAttendance.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                      <small>per recorded session</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Average time together</dt>
                    <dd>
                      {durationLabel(Math.round(s.averageSeconds))}
                      <small>
                        start to finale or early end, including pauses
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>Made it to the finale</dt>
                    <dd>
                      {s.completed} / {s.sessions}
                      <small>
                        recorded sessions; unfinished first rounds and lost runs
                        are excluded
                      </small>
                    </dd>
                  </div>
                </dl>
                <p>
                  {s.types
                    .map(
                      (t) =>
                        `${t.sessions} ${t.type} ${t.sessions === 1 ? "session" : "sessions"}`,
                    )
                    .join(" · ")}
                </p>
              </aside>
            </div>
            <div className="analytics-sources">
              <Usage
                title="Events, on repeat."
                rows={s.events}
                kind="eventId"
                query={selection}
              />
              <Usage title="Material that made it out." rows={s.packs} />
            </div>
            <p className="history-footnote">
              These are usage summaries, never ratings of people. No
              cross-session player identities, creative submissions or drawings
              are retained.
            </p>
          </>
        )
      )}
    </section>
  );
}
function Usage({
  title,
  rows,
  kind,
  query = "range=30",
}: {
  title: string;
  rows: { id: string; title: string; plays: number }[];
  kind?: "eventId";
  query?: string;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {rows.length ? (
        <ol>
          {rows.map((r) => (
            <li key={r.id}>
              <b>{r.title}</b>
              <span>
                {r.plays}{" "}
                {kind
                  ? r.plays === 1
                    ? "session"
                    : "sessions"
                  : r.plays === 1
                    ? "segment"
                    : "segments"}
                {kind && r.plays > 1 ? ` · ${r.plays - 1} repeat launches` : ""}
              </span>
              {kind && (
                <Link to={sessionsLink(query, kind, r.id)}>See sessions ↗</Link>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {kind
            ? "No Events in this selection yet."
            : "No Content Packs in this selection yet."}
        </p>
      )}
    </section>
  );
}

function sessionsLink(query: string, key: "game" | "eventId", id: string) {
  const params = new URLSearchParams(query);
  params.delete("cursor");
  params.set(key, id);
  return `/app/history?${params}`;
}
