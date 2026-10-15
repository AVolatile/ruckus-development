import { AudioSettings } from "../audio/AudioControls";
import VerificationNotice from "../auth/VerificationNotice";
import { useState } from "react";
import { Link, useNavigate } from "../workspaces/navigation";
import { useHostAuth } from "../auth/HostAuth";
import { Avatar, Tag } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
export function AccountSettings() {
  const auth = useHostAuth(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <section className="page-hero">
        <Tag>YOUR HOST ACCOUNT</Tag>
        <h1>
          Keep your
          <br />
          <span>good stuff.</span>
        </h1>
        <p>
          Signed in as {auth.user?.email}. Your personal and shared workspaces
          follow you when you sign in on another device.
        </p>
      </section>
      {auth.user && <AudioSettings accountId={auth.user.id} />}
      <section className="section">
        <VerificationNotice />
        <div className="studio-empty">
          <Avatar id={3} size={95} />
          <div>
            <h2>Your library. Wherever you host.</h2>
            <p>
              Export portable copies from Studio. Local boards from before
              accounts can be copied into a workspace you can write to. Their
              originals stay on the device.
            </p>
            <ErrorMessage message={error} />
            <div className="hero-actions">
              <Link className="button" to="/app/studio">
                Manage and export boards ↗
              </Link>
              <button
                className="button outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await auth.logout();
                    navigate("/login", { replace: true });
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Couldn’t sign out. Try again.",
                    );
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
