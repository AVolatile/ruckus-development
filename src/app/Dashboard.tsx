import { useWorkspace } from "../workspaces/WorkspaceContext";
import { lazy, Suspense } from "react";
import { Link } from "../workspaces/navigation";
import { GAMES } from "../../shared/catalog";
import { useBoardLibrary } from "../studio/useBoardLibrary";
import { GameCard } from "../components/GameCard";
import { Avatar, Icon, Tag } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
const TemplateShelf = lazy(() => import("./TemplateShelf"));

export default function Dashboard() {
  const { can, current } = useWorkspace();
  const library = useBoardLibrary();
  return (
    <>
      <section className="studio-hero dashboard-hero">
        <div>
          <Tag>THE HOST’S SEAT</Tag>
          <h1>
            Good company.
            <br />
            <span>Your call.</span>
          </h1>
          <p>
            Pick a game. Make something personal. Give the room a reason to put
            everything else down.
          </p>
          <div className="hero-actions">
            {can("boards.launch") && (
              <Link className="button" to="/app/host">
                Start a Ruckus <Icon name="arrow" />
              </Link>
            )}
            {can("boards.create") && (
              <Link className="button outline" to="/app/studio/boards/new">
                Create a board
              </Link>
            )}
          </div>
        </div>
        <div className="studio-hero-art">
          <Avatar id={5} size={190} />
        </div>
      </section>
      {current.kind === "organization" && (
        <section className="section workspace-panel">
          <h2>{current.name}</h2>
          <p>
            {current.memberCount} members · {current.role}
          </p>
          <div className="hero-actions">
            <Link to="/app/members">Members ↗</Link>
            <Link to="/app/brand">Brand Kits ↗</Link>
            <Link to="/app/studio">Shared library ↗</Link>
          </div>
        </section>
      )}
      <section className="section studio-library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
            <h2>Recent boards.</h2>
          </div>
          <Link to="/app/studio" className="button outline">
            All my boards ↗
          </Link>
        </div>
        <ErrorMessage message={library.error} />
        {library.loading && <p role="status">Loading recent boards…</p>}
        {library.error && (
          <button
            className="button outline"
            onClick={() => void library.reload()}
          >
            Try loading again
          </button>
        )}
        {library.items.length ? (
          <div className="board-grid">
            {library.items.slice(0, 3).map((board) => (
              <article className="board-card" key={board.id}>
                <Link
                  className="board-cover"
                  to={`/app/studio/boards/${board.id}`}
                  style={{
                    background: board.coverStyle.color,
                    color:
                      board.coverStyle.color === "#2548f4"
                        ? "#fffaf0"
                        : "#191a24",
                  }}
                >
                  <Icon name={board.coverStyle.icon} />
                  <span>{board.category}</span>
                  <h3>{board.title || "Untitled board"}</h3>
                </Link>
                <div className="board-card-details">
                  <p>
                    {board.questionCount} questions · Saved to this workspace
                  </p>
                  <Link
                    className="button small outline"
                    to={`/app/studio/boards/${board.id}`}
                  >
                    Keep creating ↗
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !library.loading &&
          !library.error && (
            <div className="studio-empty">
              <Avatar id={2} size={95} />
              <div>
                <h3>Your first board starts here.</h3>
                <p>
                  Bring your own trivia, try a poll, or make a starter your own.
                  Your work saves to this workspace.
                </p>
                {can("boards.create") && (
                  <Link className="button" to="/app/studio/boards/new">
                    Create my first board <Icon name="arrow" />
                  </Link>
                )}
              </div>
            </div>
          )
        )}
      </section>
      <section className="section games-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">READY WHEN YOUR ROOM IS</span>
            <h2>Ruckus Originals.</h2>
          </div>
          <Link to="/app/originals" className="button outline">
            Find your lineup ↗
          </Link>
        </div>
        <div className="game-grid">
          {GAMES.map((game, index) => (
            <GameCard key={game.id} game={game} index={index} />
          ))}
        </div>
      </section>
      <Suspense
        fallback={
          <section className="section">
            <p role="status">Opening starter boards…</p>
          </section>
        }
      >
        <TemplateShelf />
      </Suspense>
    </>
  );
}
