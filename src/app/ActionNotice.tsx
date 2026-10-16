import { useState } from "react";
import { useLocation } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";

/** Passed by the action only after its server request resolves successfully. */
export function ActionNotice() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState("");
  const message: unknown = location.state?.hostNotice;
  if (typeof message !== "string" || dismissed === location.key) return null;
  return (
    <div className="host-action-notice">
      <StatusBadge tone="saved">{message}</StatusBadge>
      <button
        className="button small text-button"
        aria-label="Dismiss confirmation"
        onClick={() => setDismissed(location.key)}
      >
        Close ×
      </button>
    </div>
  );
}
