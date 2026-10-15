import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Avatar, Icon, Tag } from "../components/Visuals";
import { HostAuthProvider, useHostAuth } from "./HostAuth";
import { safeReturnTo } from "./returnTo";
import { request, ApiClientError } from "../lib/api";
function AccountForm({ signup }: { signup: boolean }) {
  const auth = useHostAuth(),
    [query] = useSearchParams();
  const returnTo = safeReturnTo(query.get("returnTo"));
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<{ email?: string; password?: string }>({});
  if (auth.user) return <Navigate replace to={returnTo} />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const errors = {
      email:
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
        email.trim().length <= 254
          ? undefined
          : "Enter a valid email address.",
      password:
        password.length >= (signup ? 12 : 1) && password.length <= 128
          ? undefined
          : signup
            ? "Use a passphrase between 12 and 128 characters."
            : "Enter your password (up to 128 characters).",
    };
    setFields(errors);
    if (errors.email || errors.password) return;
    setBusy(true);
    try {
      await request(`/api/auth/${signup ? "sign-up" : "sign-in"}/email`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...(signup ? { name: email.trim().split("@")[0] } : {}),
        }),
      });
      setPassword("");
      await auth.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError && cause.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : cause instanceof ApiClientError && cause.code === "NETWORK_ERROR"
            ? cause.message
            : signup
              ? "Couldn’t create your account. Try signing in or use another email."
              : "We couldn’t sign you in. Check your email and password.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-page account-entry">
      <div className="setup-intro">
        <Tag>
          {signup
            ? "YOUR NEXT GREAT ROOM STARTS HERE"
            : "THE HOST’S SEAT IS WAITING"}
        </Tag>
        <h1>
          {signup ? (
            <>
              Make a little
              <br />
              <span>Ruckus.</span>
            </>
          ) : (
            <>
              Back for
              <br />
              <span>another round?</span>
            </>
          )}
        </h1>
        <p>
          Your people. Your games. Your private board library,
          <br />
          ready wherever you sign in.
        </p>
        <div className="setup-character">
          <Avatar id={signup ? 5 : 1} size={190} />
        </div>
      </div>
      <form
        className="setup-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <Tag>YOUR RUCKUS ACCOUNT</Tag>
        <h2>{signup ? "Claim the host’s seat." : "Welcome back."}</h2>
        <label htmlFor="host-email">
          Email
          <input
            id="host-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={!!fields.email}
            aria-describedby={fields.email ? "email-error" : undefined}
          />
        </label>
        {fields.email && (
          <p className="field-error" id="email-error" role="alert">
            {fields.email}
          </p>
        )}
        <label htmlFor="host-password">
          Password
          <input
            id="host-password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 12 : undefined}
            maxLength={128}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={!!fields.password}
            aria-describedby={
              fields.password
                ? "password-error password-guidance"
                : "password-guidance"
            }
          />
        </label>
        <p id="password-guidance">
          {signup
            ? "Use 12–128 characters. Long passphrases and password managers are welcome."
            : "Use the password for your Ruckus host account."}
        </p>
        {fields.password && (
          <p className="field-error" id="password-error" role="alert">
            {fields.password}
          </p>
        )}
        {(error || auth.error) && (
          <p className="error-message" role="alert">
            {error || auth.error}
          </p>
        )}
        <button className="button" disabled={busy || auth.loading}>
          {busy
            ? signup
              ? "Creating your account…"
              : "Signing in…"
            : signup
              ? "Create my account"
              : "Sign in"}
          <Icon name="arrow" />
        </button>
        <Link
          to={`${signup ? "/login" : "/signup"}?returnTo=${encodeURIComponent(returnTo)}`}
          className="back-link"
        >
          {signup
            ? "Already a host? Sign in ↗"
            : "New here? Create an account ↗"}
        </Link>
        <Link to="/join" className="back-link">
          Here to play? Join without an account ↗
        </Link>
      </form>
    </section>
  );
}
export default function AccountEntry({ signup = false }: { signup?: boolean }) {
  return (
    <HostAuthProvider>
      <AccountForm signup={signup} />
    </HostAuthProvider>
  );
}
