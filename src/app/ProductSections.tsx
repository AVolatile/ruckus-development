import { useWorkspace } from "../workspaces/context";
import { Link } from "../workspaces/navigation";
import { Icon, Tag } from "../components/Visuals";

export function Library() {
  const { can, current } = useWorkspace();
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
            <h2>
              {current.kind === "personal" ? "My boards" : "Shared boards"}
            </h2>
            <p>
              This workspace’s saved boards, plus real starter templates and a
              searchable question library.
            </p>
            <span>Open Studio ↗</span>
          </Link>
          {can("boards.create") && (
            <Link className="occasion" to="/app/studio/boards/new">
              <Icon name="asterisk" />
              <h2>Something new</h2>
              <p>
                Build trivia, True / False, or polls around the things your
                people know.
              </p>
              <span>Create a board ↗</span>
            </Link>
          )}
        </div>
      </section>
    </>
  );
}

export function HostEvents() {
  const { can } = useWorkspace();
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
          {can("boards.launch") && (
            <Link className="button" to="/app/host">
              Start an event room <Icon name="arrow" />
            </Link>
          )}
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
