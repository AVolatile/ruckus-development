import { useEffect, useState } from "react";
import {
  eventTemplateSpecs,
  type EventRecord,
  type EventSummary,
} from "../../shared/events";
import { useWorkspace } from "../workspaces/context";
import { Link, useNavigate } from "../workspaces/navigation";
import { request } from "../lib/api";
export default function EventList() {
  const { current, can } = useWorkspace(),
    navigate = useNavigate();
  const [items, setItems] = useState<EventSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const base = `/api/v1/workspaces/${current.id}/events`;
  useEffect(() => {
    let active = true;
    void request<{ items: EventSummary[]; nextCursor: string | null }>(base)
      .then((r) => {
        if (active) {
          setItems(r.items);
          setCursor(r.nextCursor);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [base]);
  async function create(templateId: string) {
    setBusy(true);
    setError("");
    try {
      const event = await request<EventRecord>(base, {
        method: "POST",
        body: JSON.stringify({ templateId }),
      });
      navigate(`/app/events/${event.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className="events-page">
      <div className="page-hero">
        <span className="eyebrow">YOUR PEOPLE. ONE INVITATION.</span>
        <h1>Make a night of it.</h1>
        <p>
          Line up Originals and your Studio boards. Give the room one code, then
          carry the same crew through every game.
        </p>
        {can("events.create") && (
          <Link className="button" to="/app/events/new">
            Create an event ↗
          </Link>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="section-heading">
        <h2>
          {current.kind === "personal" ? "Your events" : "Workspace events"}
        </h2>
        <span>Private to {current.name}</span>
      </div>
      {loading ? (
        <p role="status">Loading events…</p>
      ) : items.length ? (
        <div className="event-card-grid">
          {items.map((e) => (
            <article className="event-card" key={e.id}>
              <span className="eyebrow">{e.status.toUpperCase()}</span>
              <h3>{e.name}</h3>
              <p>Updated {new Date(e.updatedAt).toLocaleDateString()}</p>
              <Link
                className="button outline"
                to={`/app/events/${e.id}${can("events.update") ? "" : "/preview"}`}
              >
                {can("events.update") ? "Open event" : "Preview event"} ↗
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="event-empty">
          <h3>The room is yours to build.</h3>
          <p>
            {can("events.create")
              ? "Start with a blank event or take a Ruckus starter for a spin."
              : "Events created by your workspace will appear here."}
          </p>
        </div>
      )}
      {cursor && (
        <button
          className="button outline"
          onClick={() => {
            void request<{ items: EventSummary[]; nextCursor: string | null }>(
              `${base}?cursor=${encodeURIComponent(cursor)}`,
            )
              .then((r) => {
                setItems((old) => [...old, ...r.items]);
                setCursor(r.nextCursor);
              })
              .catch((e) => setError(e.message));
          }}
        >
          Load more events
        </button>
      )}
      {can("events.create") && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">RUCKUS STARTERS</span>
              <h2>A little structure. A lot of possibility.</h2>
              <p>
                Editable starting lineups made from real Originals. Add Studio
                boards to make them your own.
              </p>
            </div>
          </div>
          <div className="event-card-grid">
            {eventTemplateSpecs.map((t) => (
              <article className="event-card starter" key={t.id}>
                <span className="eyebrow">{t.games.length} ORIGINALS</span>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => void create(t.id)}
                >
                  Use starter ↗
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
