import { useState } from "react";
import { useHostAuth } from "./HostAuth";
import { request } from "../lib/api";
export default function VerificationNotice() {
  const { user, refresh } = useHostAuth();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (user?.emailVerified) return null;
  return (
    <aside className="verification-notice">
      <div>
        <strong>Confirm your email. Bring your people.</strong>
        <p>
          Personal boards are ready now. Verify {user?.email} to create or join
          shared workspaces.
        </p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="hero-actions">
        <button
          className="button small outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await request("/api/auth/send-verification-email", {
                method: "POST",
                body: JSON.stringify({ email: user?.email }),
              });
              setMessage("Verification email sent. Check your inbox.");
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Couldn’t send email. Try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Resend verification
        </button>
        <button
          className="button small outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          I’ve verified my email
        </button>
      </div>
    </aside>
  );
}
