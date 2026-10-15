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
      <div className="page-hero">
        <span className="eyebrow">THE START OF SOMETHING GOOD</span>
        <h1>What’s the occasion?</h1>
        <p>Name the event, then build a lineup your room will remember.</p>
      </div>
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
            body: JSON.stringify({ definition: emptyEvent(title) }),
          })
            .then((r) => navigate(`/app/events/${r.id}`, { replace: true }))
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
