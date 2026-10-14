import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { GAMES } from "../../shared/catalog";
import { boards } from "../studio/repository";
import { GameCard } from "../components/GameCard";
import { Avatar, Icon, Tag } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
const TemplateShelf = lazy(() => import("./TemplateShelf"));

export default function Dashboard() {
  const [library] = useState(() => {
    try {
      return { items: boards.list().slice(0, 3), error: "" };
    } catch (error) {
      return {
        items: [],
        error:
          error instanceof Error
            ? error.message
            : "Your boards couldn’t be read. Open Studio to try again.",
      };
    }
  });
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
            <Link className="button" to="/app/host">
              Start a Ruckus <Icon name="arrow" />
            </Link>
            <Link className="button outline" to="/app/studio/boards/new">
              Create a board
            </Link>
          </div>
        </div>
        <div className="studio-hero-art">
          <Avatar id={5} size={190} />
        </div>
      </section>
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
        {library.items.length ? (
          <div className="board-grid">
            {library.items.map((board) => (
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
                    {board.questions.length} questions · Saved in this browser
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
          !library.error && (
            <div className="studio-empty">
              <Avatar id={2} size={95} />
              <div>
                <h3>Your first board starts here.</h3>
                <p>
                  Bring your own trivia, try a poll, or make a starter your own.
                  Your work saves in this browser.
                </p>
                <Link className="button" to="/app/studio/boards/new">
                  Create my first board <Icon name="arrow" />
                </Link>
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
