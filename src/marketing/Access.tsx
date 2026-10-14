import { Link } from "react-router-dom";
import { Avatar, Icon, Tag } from "../components/Visuals";
export function AccountEntry({ signup = false }: { signup?: boolean }) {
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
          Host the screen. Players bring their phones.
          <br />
          The good kind of getting everyone involved.
        </p>
        <div className="setup-character">
          <Avatar id={signup ? 5 : 1} size={190} />
        </div>
      </div>
      <div className="setup-form">
        <Tag>HOST ACCOUNTS / COMING SOON</Tag>
        <h2>
          {signup ? "Free accounts are on the way." : "Sign-in is on the way."}
        </h2>
        <p>
          Host tools are open to try now, without an account. You can play all
          six Originals and create custom boards. Boards save in this browser;
          cloud saving isn’t available yet.
        </p>
        <Link className="button" to="/app">
          Continue to host tools <Icon name="arrow" />
        </Link>
        <p>No email or password needed right now.</p>
        <Link to={signup ? "/login" : "/signup"} className="back-link">
          {signup ? "Looking for sign-in? ↗" : "New to Ruckus? ↗"}
        </Link>
        <Link to="/join" className="back-link">
          Here to play? Join a room ↗
        </Link>
      </div>
    </section>
  );
}
export function Pricing() {
  return (
    <>
      <section className="page-hero">
        <Tag>EARLY DAYS. REAL PLAY.</Tag>
        <h1>
          Room to
          <br />
          <span>grow.</span>
        </h1>
        <p>
          Host tools are free to try during development.
          <br />
          Commercial pricing is still taking shape.
        </p>
        <div className="hero-actions">
          <Link to="/signup" className="button">
            Start free <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="section pricing-panel">
        <div>
          <span className="eyebrow">AVAILABLE NOW</span>
          <h2>Bring your people.</h2>
          <p>
            Six Originals, custom boards, and a shared screen worth looking up
            for.
          </p>
          <Link to="/app" className="button">
            Explore host tools ↗
          </Link>
        </div>
        <ul>
          {[
            "Live rooms for 2–30 players",
            "Phone controllers and QR joining",
            "Studio with templates and question libraries",
            "Local board saving and file import/export",
            "Player joining without accounts",
          ].map((text) => (
            <li key={text}>
              <Icon name="check" />
              {text}
            </li>
          ))}
        </ul>
      </section>
      <section className="section practical-note">
        <h2>Players stay welcome.</h2>
        <p>
          Our direction: free players, paid hosts, premium workplaces. Accounts,
          cloud libraries, and organization tools will arrive in future
          releases. Plans and pricing will be published when they’re ready.
        </p>
      </section>
    </>
  );
}
