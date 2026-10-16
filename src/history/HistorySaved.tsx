import "./live-feedback.css";
import { Link } from "react-router-dom";
import type { RoomView } from "../../shared/types";
import { StatusBadge } from "../app/StatusBadge";
export function HistorySaved({ room }: { room: RoomView }) {
  const h = room.history;
  if (!h) return null;
  return (
    <div className="live-history-feedback">
      {h.status === "saved" ? (
        <Link
          className="button light-outline small"
          to={`/app/w/${h.workspaceId}/history/${h.sessionId}`}
        >
          Open saved recap ↗
        </Link>
      ) : (
        <StatusBadge tone={h.status === "saving" ? "saving" : "error"}>
          {h.status === "saving"
            ? "Saving your recap…"
            : "Recap couldn’t be saved. Live results are still here."}
        </StatusBadge>
      )}
    </div>
  );
}
