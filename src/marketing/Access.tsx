import { Link } from "react-router-dom";
import { Icon, Tag } from "../components/Visuals";
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
            "Private cloud boards and file import/export",
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
          Our direction: free players, paid hosts, premium workplaces. Host
          accounts and private cloud libraries are available now; organization
          tools are planned. Plans and pricing will be published when they’re
          ready.
        </p>
      </section>
    </>
  );
}
