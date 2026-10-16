import { GAMES } from "../../shared/catalog";
import type { CSSProperties } from "react";
import { useWorkspace } from "../workspaces/context";
import { Link } from "../workspaces/navigation";
import { Icon, Tag } from "../components/Visuals";

export function Library() {
  const { can, current } = useWorkspace();
  return (
    <>
      <section className="section library-hub">
        <header className="library-intro">
          <span className="eyebrow">EVERY KIND OF LOUD, IN ONE PLACE</span>
          <h1>
            Your next <span>great lineup.</span>
          </h1>
          <p>
            Originals set the rules. Content Packs bring fresh material. Studio
            makes it personal. Events bring it all together.
          </p>
        </header>
        <div className="library-discovery">
          <Link className="library-originals" to="/app/originals">
            <div className="library-originals-copy">
              <span className="eyebrow">01 / RUCKUS ORIGINALS</span>
              <h2>
                Find your
                <br />
                kind of loud.
              </h2>
              <p>
                Fast thinkers. Wild pitchers. Terrible artists. Six games, ready
                when your room is.
              </p>
              <span className="library-direction">
                Choose a game <Icon name="arrow" />
              </span>
            </div>
            <div className="library-game-ensemble" aria-hidden="true">
              {GAMES.map((game, index) => (
                <div
                  key={game.id}
                  style={{ "--game-color": game.color } as CSSProperties}
                >
                  <span>0{index + 1}</span>
                  <Icon name={game.icon} />
                </div>
              ))}
            </div>
          </Link>
          <Link className="library-packs" to="/app/content-packs">
            <span className="eyebrow">
              02 / FRESH MATERIAL. SAME GOOD GAMES.
            </span>
            <div className="library-pack-art" aria-hidden="true">
              <Icon name="asterisk" />
              <span className="orbit-line" />
            </div>
            <h2>Content Packs</h2>
            <p>
              New questions. Different scenes. Your next excellent prompt. Find
              material for an Original, or write your own.
            </p>
            <span className="library-direction">
              Find your next pack <Icon name="arrow" />
            </span>
          </Link>
        </div>
        <div className="library-making">
          <div className="library-studio">
            <span className="eyebrow">03 / THE CREATOR’S SEAT</span>
            <h2>
              Your questions.
              <br />
              Their competitive side.
            </h2>
            <p>
              Trivia, True / False, polls. Bring the inside knowledge. Studio
              turns it into something the room can play.
            </p>
            <Link className="library-direction" to="/app/studio">
              Open Studio <Icon name="arrow" />
            </Link>
            <span className="library-board-label">
              {current.kind === "personal" ? "My boards" : "Shared boards"} +
              editable starters
            </span>
            {can("boards.create") && (
              <Link className="library-new-board" to="/app/studio/boards/new">
                Something new? Create a board ↗
              </Link>
            )}
          </div>
          <Link className="library-events" to="/app/events">
            <span className="eyebrow">04 / GIVE THE NIGHT A RUN OF SHOW</span>
            <h2>
              One room.
              <br />A whole lineup.
            </h2>
            <p>
              Events carry your crew from Original to Studio board to the next
              good thing. One invitation, all the way through.
            </p>
            <div className="library-sequence" aria-hidden="true">
              <span>
                01
                <br />
                Choose
              </span>
              <Icon name="arrow" />
              <span>
                02
                <br />
                Arrange
              </span>
              <Icon name="arrow" />
              <span>
                03
                <br />
                Play
              </span>
            </div>
            <span className="library-direction">
              Build an Event <Icon name="arrow" />
            </span>
          </Link>
        </div>
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
