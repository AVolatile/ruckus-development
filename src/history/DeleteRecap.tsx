import { useRef, useState } from "react";
import { request } from "../lib/api";
import { useWorkspace } from "../workspaces/context";
import { useNavigate } from "../workspaces/navigation";
export function DeleteRecap({ id }: { id: string }) {
  const { current } = useWorkspace(),
    navigate = useNavigate();
  const [confirming, setConfirming] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmed = confirmation.trim().toUpperCase() === "DELETE";
  if (!current.permissions.includes("history.delete")) return null;
  return (
    <section className="recap-deletion" aria-label="Delete session history">
      <h2>Keep only what you need.</h2>
      <p>
        Owners and Admins can permanently remove this recap and its contribution
        to Analytics. Source boards, Packs and Events stay in your library.
      </p>
      {!confirming ? (
        <button
          ref={trigger}
          className="button outline small"
          onClick={() => setConfirming(true)}
        >
          Delete recap
        </button>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!confirmed || busy) return;
            setBusy(true);
            setError("");
            try {
              await request(`/api/v1/workspaces/${current.id}/sessions/${id}`, {
                method: "DELETE",
                body: JSON.stringify({ confirm: "delete" }),
              });
              navigate("/app/history", {
                replace: true,
                state: {
                  hostNotice:
                    "Recap deleted. Analytics now reflects the remaining sessions.",
                },
              });
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Couldn’t delete this recap. Try again.",
              );
              setBusy(false);
            }
          }}
        >
          <p>
            This removes guest names, standings and segment results. It cannot
            be undone. A record of this deletion is kept in workspace activity.
          </p>
          <label>
            Type DELETE to confirm
            <input
              autoFocus
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button className="button danger" disabled={!confirmed || busy}>
              {busy ? "Deleting recap…" : "Permanently delete recap"}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setConfirmation("");
                setError("");
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
