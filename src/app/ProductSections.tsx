import { Link } from "react-router-dom";
import { Avatar, Icon, Tag } from "../components/Visuals";

export function Library() {
  return (
    <>
      <section className="page-hero">
        <Tag>EVERY KIND OF LOUD, IN ONE PLACE</Tag>
        <h1>
          Your next
          <br />
          <span>great lineup.</span>
        </h1>
        <p>
          Play an Original right away, or bring your own questions to the room.
        </p>
      </section>
      <section className="section">
        <div className="occasion-grid">
          <Link className="occasion" to="/app/originals">
            <Icon name="bolt" />
            <h2>Originals</h2>
            <p>
              Six games. Fast thinkers, wild pitchers, terrible artists:
              everyone gets a turn.
            </p>
            <span>Choose a game ↗</span>
          </Link>
          <Link className="occasion" to="/app/studio">
            <Icon name="screen" />
            <h2>My boards</h2>
            <p>
              Your browser’s saved boards, plus real starter templates and a
              searchable question library.
            </p>
            <span>Open Studio ↗</span>
          </Link>
          <Link className="occasion" to="/app/studio/boards/new">
            <Icon name="asterisk" />
            <h2>Something new</h2>
            <p>
              Build trivia, True / False, or polls around the things your people
              know.
            </p>
            <span>Create a board ↗</span>
          </Link>
        </div>
      </section>
    </>
  );
}

export function HostEvents() {
  return (
    <>
      <section className="page-hero">
        <Tag>GIVE THE CALENDAR A BETTER IDEA</Tag>
        <h1>
          Bring your
          <br />
          <span>occasion.</span>
        </h1>
        <p>
          Run a live room for your next team social, offsite, party, or
          gathering. Up to 30 players can join from their phones.
        </p>
        <div className="hero-actions">
          <Link className="button" to="/app/host">
            Start an event room <Icon name="arrow" />
          </Link>
          <Link className="button outline" to="/app/studio">
            Prepare a custom board
          </Link>
        </div>
      </section>
      <section className="section practical-note">
        <h2>A room now. Event planning later.</h2>
        <p>
          Rooms open when you start them. Saved event schedules, invitations,
          and event branding are planned; there’s no booking or event history to
          manage yet.
        </p>
      </section>
    </>
  );
}

const future = {
  analytics: {
    title: "The bigger picture.",
    description:
      "Live scoring, leaderboards, and a session summary already come with your room. Saved reports and cross-session analytics are coming later.",
    action: "Start a room",
    to: "/app/host",
  },
  workspace: {
    title: "Room for your team.",
    description:
      "Shared libraries, organization memberships, and reusable Brand Kits are planned. For now, host a room or build a board in this browser.",
    action: "Build a board",
    to: "/app/studio",
  },
};
export function FutureSection({ section }: { section: keyof typeof future }) {
  const content = future[section];
  return (
    <section className="page-hero">
      <Tag>COMING LATER / {section.toUpperCase()}</Tag>
      <h1>{content.title}</h1>
      <p>{content.description}</p>
      <div className="hero-actions">
        <Link className="button" to={content.to}>
          {content.action} <Icon name="arrow" />
        </Link>
        <Link className="button outline" to="/app">
          Back to host home
        </Link>
      </div>
    </section>
  );
}
export function Settings() {
  return (
    <>
      <section className="page-hero">
        <Tag>YOUR HOST SETUP</Tag>
        <h1>
          Keep your
          <br />
          <span>good stuff.</span>
        </h1>
        <p>
          Boards save on this device, in this browser. Export them from Studio
          before switching devices or clearing browser data.
        </p>
      </section>
      <section className="section">
        <div className="studio-empty">
          <Avatar id={3} size={95} />
          <div>
            <h2>Local library. Real boards.</h2>
            <p>
              Accounts, cloud sync, and account settings are coming soon. No
              account is connected to these boards yet.
            </p>
            <div className="hero-actions">
              <Link className="button" to="/app/studio">
                Manage and export boards ↗
              </Link>
              <Link className="button outline" to="/signup">
                About accounts
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
