import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { request } from "../lib/api";
import { Avatar, Tag } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
export default function SecurityFlow({
  mode,
}: {
  mode: "forgot" | "reset" | "verify";
}) {
  const [query] = useSearchParams();
  const [token] = useState(() => query.get("token") || "");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const title =
    mode === "verify"
      ? "Make it official."
      : mode === "forgot"
        ? "Back in the game."
        : "A fresh start.";
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "forgot" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "reset" && (password.length < 12 || password.length > 128)) {
      setError("Use a password between 12 and 128 characters.");
      return;
    }
    if (mode !== "forgot" && !token) {
      setError("This link is incomplete. Request a new email.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "verify")
        await request(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
      else
        await request(
          mode === "forgot"
            ? "/api/auth/request-password-reset"
            : "/api/auth/reset-password",
          {
            method: "POST",
            body: JSON.stringify(
              mode === "forgot"
                ? {
                    email: email.trim().toLowerCase(),
                    redirectTo: location.origin + "/reset-password",
                  }
                : { token, newPassword: password },
            ),
          },
        );
      setDone(true);
      setPassword("");
      if (mode !== "forgot") history.replaceState(null, "", location.pathname);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This link couldn’t be used. Request a fresh email.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-page account-entry">
      <div className="setup-intro">
        <Tag>YOUR RUCKUS ACCOUNT</Tag>
        <h1>{title}</h1>
        <p>
          {mode === "verify"
            ? "Confirm your email to create and join shared workspaces."
            : "Your good stuff is still here. Let’s get you back to it."}
        </p>
        <Avatar id={1} size={160} />
      </div>
      <form className="setup-form" noValidate onSubmit={(e) => void submit(e)}>
        <h2>
          {mode === "verify"
            ? "Verify your email"
            : mode === "forgot"
              ? "Find your account"
              : "Choose a new password"}
        </h2>
        {done ? (
          <>
            <p role="status">
              {mode === "verify"
                ? "Your email is verified. Your workspace is ready."
                : mode === "forgot"
                  ? "If an account uses that address, a password reset email has been sent. Check your inbox and spam folder."
                  : "Password updated. Previous sessions have been revoked. Sign in with your new password."}
            </p>
            <Link className="button" to={mode === "verify" ? "/app" : "/login"}>
              {mode === "verify" ? "Open Ruckus ↗" : "Back to sign in ↗"}
            </Link>
          </>
        ) : (
          <>
            {mode === "forgot" && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={error ? "security-error" : undefined}
                />
              </label>
            )}
            {mode === "reset" && (
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-guidance"
                />
                <small id="password-guidance">
                  Use a passphrase with 12–128 characters.
                </small>
              </label>
            )}
            <div id="security-error">
              <ErrorMessage message={error} />
            </div>
            <button className="button" disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "verify"
                  ? "Verify email"
                  : mode === "forgot"
                    ? "Send reset email"
                    : "Save new password"}
            </button>
            <p>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </form>
    </section>
  );
}
