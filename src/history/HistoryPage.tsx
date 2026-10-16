import "./history.css";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../workspaces/context";
import { Link } from "../workspaces/navigation";
import { Tag } from "../components/Visuals";
import { StatusBadge } from "../app/StatusBadge";
import type { SessionPage } from "../../shared/history";
import { request } from "../lib/api";
import { useHistoryRequest } from "./useHistoryRequest";
import {
  dateLabel,
  durationLabel,
  HistoryTabs,
  HistoryFilters,
  HistoryMark,
  HistoryEmpty,
  HistoryError,
  historyQuery,
} from "./HistoryParts";
export default function HistoryPage() {
  const { current } = useWorkspace(),
    [params] = useSearchParams(),
    query = historyQuery(params).toString(),
    base = `/api/v1/workspaces/${current.id}/sessions`,
    state = useHistoryRequest<SessionPage>(`${base}?${query}`);
  return (
    <section className="history-page">
      <header className="history-intro">
        <Tag>HISTORY / GOOD TIMES, KEPT</Tag>
        <h1>
          That was
          <br />
          <span>a Ruckus.</span>
        </h1>
        <p>
          The games, the crew, the final pecking order. Your workspace’s past
          sessions, ready for another look.
        </p>
      </header>
      <HistoryTabs />
      <HistoryFilters />
      {state.loading ? (
        <StatusBadge tone="saving">Loading sessions…</StatusBadge>
      ) : state.error ? (
        <HistoryError message={state.error} retry={state.reload} />
      ) : (
        state.data && (
          <SessionShelf
            key={`${current.id}:${query}:${state.data.items[0]?.id ?? "empty"}`}
            first={state.data}
            base={base}
            query={query}
            filtered={params.size > 0}
          />
        )
      )}
    </section>
  );
}
function SessionShelf({
  first,
  base,
  query,
  filtered,
}: {
  first: SessionPage;
  base: string;
  query: string;
  filtered: boolean;
}) {
  const [data, setData] = useState(first),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function more() {
    setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams(query);
      q.set("cursor", data.nextCursor!);
      const next = await request<SessionPage>(`${base}?${q}`);
      setData((old) => ({
        items: [...old.items, ...next.items],
        nextCursor: next.nextCursor,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data.items.length) return <HistoryEmpty filtered={filtered} />;
  const groups = new Map<string, SessionPage["items"]>();
  for (const s of data.items) {
    const day = s.startedAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), s]);
  }
  return (
    <>
      <div className="history-timeline">
        {[...groups].map(([date, sessions]) => (
          <section
            className="history-date-group"
            key={date}
            aria-label={dateLabel(date)}
          >
            <h2>
              <time dateTime={date}>{dateLabel(date)}</time>
              <small>UTC</small>
            </h2>
            <ol>
              {sessions.map((s) => (
                <li className="history-entry" key={s.id}>
                  <HistoryMark source={s.source} type={s.type} />
                  <div>
                    <span className="eyebrow">
                      {s.type} /{" "}
                      {new Date(s.startedAt).toISOString().slice(11, 16)} UTC
                    </span>
                    <h3>{s.title}</h3>
                    <p>
                      {s.playerCountJoined} joined ·{" "}
                      {durationLabel(s.durationSeconds)} · {s.segmentCount}{" "}
                      {s.segmentCount === 1 ? "game" : "games"}
                      {s.demoCount > 0 ? ` · ${s.demoCount} demo` : ""}
                    </p>
                    <small>
                      {s.status === "completed" ? "Completed" : "Ended early"} ·{" "}
                      {s.playerCountCompleted} finished
                    </small>
                  </div>
                  <Link
                    className="history-open"
                    to={`/app/history/${s.id}`}
                    aria-label={`Open recap: ${s.title}`}
                  >
                    Open recap ↗
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      {error && <HistoryError message={error} retry={() => void more()} />}
      <div className="history-page-end">
        {data.nextCursor && (
          <button
            className="button outline"
            onClick={() => void more()}
            disabled={busy}
          >
            {busy ? "Loading…" : "Earlier Ruckus ↓"}
          </button>
        )}
        <p>
          Display names belong to each session. Attendance is counted per
          session, across people and demo players.
        </p>
      </div>
    </>
  );
}
