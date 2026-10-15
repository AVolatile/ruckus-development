import { Link } from "react-router-dom";
import { GAMES } from "../../shared/catalog";
import { GameCard } from "../components/GameCard";
import { Icon, Tag } from "../components/Visuals";
import { StagePreview } from "../components/StagePreview";
export function Product() {
  return (
    <>
      <section className="page-hero">
        <Tag>ONE SCREEN. EVERYONE IN.</Tag>
        <h1>
          Screen.
          <br />
          Scan. <span>Scene.</span>
        </h1>
        <p>
          Live multiplayer games with a stage everyone can see and a controller
          already in every pocket.
        </p>
        <div className="hero-actions">
          <Link className="button" to="/signup">
            Start free <Icon name="arrow" />
          </Link>
          <Link className="button outline" to="/app/originals">
            Explore the games
          </Link>
        </div>
      </section>
      <section className="section explainer-steps">
        {[
          [
            "01",
            "screen",
            "Host starts a room.",
            "Pick an Original or a custom board. Your laptop, TV, or projector becomes the shared stage.",
          ],
          [
            "02",
            "scan",
            "Everyone makes an entrance.",
            "Players scan the QR code or enter the room code. Pick a name and a character. No player account or download needed.",
          ],
          [
            "03",
            "phone",
            "Phones become controllers.",
            "Tap answers, write pitches, sketch, and vote. Prompts, reveals, and points stay on the big screen.",
          ],
          [
            "04",
            "trophy",
            "One more round happens.",
            "Live scoring, leaderboards, and rematches keep the room going. The host can pause, adjust the pace, or end the session.",
          ],
        ].map(([number, icon, title, text]) => (
          <article key={number}>
            <span>{number}</span>
            <Icon name={icon} />
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="section">
        <StagePreview />
      </section>
      <section id="originals" className="section games-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RUCKUS ORIGINALS</span>
            <h2>
              Six ways to
              <br />
              make a scene.
            </h2>
          </div>
          <p>
            Trivia, opinions, pitches, captions,
            <br />
            fact spotting, and drawing.
            <br />
            Different talents. Same room.
          </p>
        </div>
        <div className="game-grid">
          {GAMES.map((game, index) => (
            <GameCard key={game.id} game={game} index={index} />
          ))}
        </div>
      </section>
      <section className="home-studio">
        <div>
          <Tag>RUCKUS STUDIO</Tag>
          <h2>
            Your questions.
            <br />
            Their competitive side.
          </h2>
          <p>
            Create trivia, True / False, and polls. Start from a template, draw
            from the question library, or write your own. Preview the stage and
            phones before you go live.
          </p>
          <Link to="/app/studio" className="button">
            Explore Studio <Icon name="arrow" />
          </Link>
          <p className="studio-storage-note">
            Boards save to your private Ruckus account.
          </p>
        </div>
        <div className="home-studio-card">
          <span>CREATE → PREVIEW → PLAY</span>
          <h3>Your next team trivia</h3>
          <div>
            <b>A</b>Make a starter your own <Icon name="check" />
          </div>
          <div>
            <b>B</b>Import your questions
          </div>
          <div>
            <b>C</b>Give the room a QR code
          </div>
          <p>YOUR CONTENT. SAME BIG SCREEN ENERGY.</p>
        </div>
      </section>
      <section className="compact-cta">
        <h2>Your room has a game mode.</h2>
        <Link className="button" to="/signup">
          Start free <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
