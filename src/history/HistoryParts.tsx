import { useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "../workspaces/navigation";
import { GAMES, gameById } from "../../shared/catalog";
import type { SessionSource } from "../../shared/history";
import { Icon, Tag } from "../components/Visuals";
export const durationLabel = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${Math.round(seconds % 60)}s` : ""}`;
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
export function identity(source: SessionSource, type: string) {
  return type === "original" && source.gameType
    ? gameById(source.gameType)
    : {
        color: type === "studio" ? "#C0EE7B" : "#F6ED51",
        icon: type === "studio" ? "pencil" : "asterisk",
      };
}
export function HistoryMark({
  source,
  type,
}: {
  source: SessionSource;
  type: string;
}) {
  const game = identity(source, type);
  return (
    <span
      className="history-mark"
      style={{ "--history-accent": game.color } as CSSProperties}
      aria-hidden="true"
    >
      <Icon name={game.icon} />
      <span className="history-mark-orbit" />
    </span>
  );
}
export function HistoryTabs({ analytics = false }: { analytics?: boolean }) {
  return (
    <nav className="history-tabs" aria-label="Session history">
      <Link to="/app/history" aria-current={!analytics ? "page" : undefined}>
        Sessions
      </Link>
      <Link
        to="/app/history/analytics"
        aria-current={analytics ? "page" : undefined}
      >
        Analytics
      </Link>
    </nav>
  );
}
export function HistoryFilters({ analytics = false }: { analytics?: boolean }) {
  const [params, setParams] = useSearchParams(),
    [error, setError] = useState("");
  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      next = new URLSearchParams();
    for (const [key, value] of data)
      if (String(value)) next.set(key, String(value));
    if (
      next.get("from") &&
      next.get("to") &&
      next.get("from")! > next.get("to")!
    ) {
      setError("Choose an end date on or after the start date.");
      return;
    }
    setError("");
    setParams(next);
  }
  return (
    <form
      key={params.toString()}
      className="history-filters"
      onSubmit={apply}
      aria-label="Filter session history"
    >
      <label>
        When
        <select
          name="range"
          defaultValue={params.get("range") ?? (analytics ? "30" : "all")}
        >
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="all">All time</option>
        </select>
      </label>
      <label>
        What
        <select name="type" defaultValue={params.get("type") ?? ""}>
          <option value="">All sessions</option>
          <option value="original">Originals</option>
          <option value="studio">Studio</option>
          <option value="event">Events</option>
        </select>
      </label>
      <label>
        Original
        <select name="game" defaultValue={params.get("game") ?? ""}>
          <option value="">All games</option>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button small" type="submit">
        Apply filters ↗
      </button>
      <details
        className="history-dates"
        open={params.has("from") || params.has("to") || undefined}
      >
        <summary>Specific dates</summary>
        <div>
          <label>
            From (UTC)
            <input
              type="date"
              name="from"
              defaultValue={params.get("from") ?? ""}
            />
          </label>
          <label>
            Through (UTC)
            <input
              type="date"
              name="to"
              aria-invalid={!!error}
              aria-describedby={error ? "history-date-error" : undefined}
              defaultValue={params.get("to") ?? ""}
            />
          </label>
        </div>
      </details>
      {params.has("eventId") && (
        <input type="hidden" name="eventId" value={params.get("eventId")!} />
      )}
      {params.size > 0 && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setError("");
            setParams({});
          }}
        >
          Clear filters
        </button>
      )}
      {error && (
        <p id="history-date-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function HistoryEmpty({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="history-empty">
      <Tag>{filtered ? "A QUIETER PATCH" : "THE GOOD TIMES START HERE"}</Tag>
      <h2>
        {filtered
          ? "No sessions in this lineup."
          : "Your first Ruckus leaves a story."}
      </h2>
      <p>
        {filtered
          ? "Try a different date, game or kind of session."
          : "Play an Original, bring your own questions, or make a night of it. After the final round, the recap lands here."}
      </p>
      <div className="hero-actions">
        <Link className="button" to="/app/originals">
          Start an Original ↗
        </Link>
        <Link className="button outline" to="/app/events">
          Build an Event ↗
        </Link>
        <Link className="text-button" to="/app/studio">
          Open Studio ↗
        </Link>
      </div>
    </div>
  );
}
export function HistoryError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="history-error">
      <p role="alert">{message}</p>
      <button className="button outline small" onClick={retry}>
        Try again ↗
      </button>
    </div>
  );
}
export function historyQuery(params: URLSearchParams, analytics = false) {
  const q = new URLSearchParams(params);
  if (!q.has("range")) q.set("range", analytics ? "30" : "all");
  return q;
}
