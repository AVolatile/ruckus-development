import { PageHeader } from "../app/PageHeader";
import { GAMES } from "../../shared/catalog";
import { useState } from "react";
import { emptyEvent, type EventRecord } from "../../shared/events";
import { request } from "../lib/api";
import { useWorkspace } from "../workspaces/context";
import { Link, useNavigate } from "../workspaces/navigation";
export default function EventNew() {
  const { current } = useWorkspace(),
    navigate = useNavigate(),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="events-page">
      <Link to="/app/events">← Workspace events</Link>
      <PageHeader
        eyebrow="EVENTS / THE START OF SOMETHING GOOD"
        title="What’s the occasion?"
      >
        <p>Name the event, then build a lineup your room will remember.</p>
      </PageHeader>
      <form
        className="event-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) {
            setError("Give your event a title.");
            return;
          }
          setBusy(true);
          setError("");
          void request<EventRecord>(`/api/v1/workspaces/${current.id}/events`, {
            method: "POST",
            body: JSON.stringify({
              definition: (() => {
                const d = emptyEvent(title),
                  q = new URLSearchParams(location.search),
                  g = GAMES.find((g) => g.id === q.get("game")),
                  id = q.get("contentPackId");
                if (g && id)
                  d.playlist = [
                    {
                      type: "original",
                      gameSlug: g.id,
                      contentPackId: id,
                      itemId: crypto.randomUUID(),
                      order: 0,
                      enabled: true,
                      displayTitle: "",
                      hostNote: "",
                      transitionLabel: "",
                      settings: { rounds: 3, pace: "normal", pack: "mixed" },
                    },
                  ];
                return d;
              })(),
            }),
          })
            .then((r) =>
              navigate(`/app/events/${r.id}`, {
                replace: true,
                state: { hostNotice: "Event created. Build your lineup." },
              }),
            )
            .catch((e) => {
              setError(e.message);
              setBusy(false);
            });
        }}
      >
        <div className="event-fields">
          <label>
            Event title
            <input
              autoFocus
              required
              disabled={busy}
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Holiday Party 2027"
              aria-describedby={error ? "new-event-error" : undefined}
            />
          </label>
        </div>
        {error && (
          <p id="new-event-error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? "Creating…" : "Build this event →"}
        </button>
      </form>
    </section>
  );
}
