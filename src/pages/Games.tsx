import { useWorkspace } from "../workspaces/context";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Link, useNavigate } from "../workspaces/navigation";
import { GAMES, gameById } from "../../shared/catalog";
import { GameCard } from "../components/GameCard";
import { Icon, Tag } from "../components/Visuals";
import { DemoButton } from "../components/DemoButton";
const samples: Record<string, { title: string; body: string[] }> = {
  hotwire: {
    title: "What is the tiny plastic tip of a shoelace called?",
    body: ["Ferrule", "Aglet", "Grommet", "Toggle"],
  },
  "room-temperature": {
    title: "Pick the office mascot.",
    body: ["Pigeon", "Raccoon", "Very tired robot", "Sentient stapler"],
  },
  sellout: {
    title: "Sell a luxury stapler to someone who doesn’t own paper.",
    body: [
      "Staple Society — Hold it together, expensively.",
      "Paperweight Prestige — Unnecessary. Unforgettable.",
    ],
  },
  "caption-this": {
    title: "The pigeon has called an all-hands.",
    body: ["This could have been a coo.", "Per my last carrier pigeon."],
  },
  "odd-one-in": {
    title: "Bubble wrap was first developed as what?",
    body: [
      "Textured wallpaper",
      "Rainproof newspaper",
      "A swimming-pool cover",
      "A shoe lining",
    ],
  },
  "scribble-shift": {
    title: "A coffee machine on vacation",
    body: [
      "One finger. Six colors. Forty-five seconds.",
      "Send your drawing, then let the room pick a winner.",
    ],
  },
};
export function Games() {
  const { can } = useWorkspace();
  const [filter, setFilter] = useState("all"),
    [energy, setEnergy] = useState("all"),
    [time, setTime] = useState("all");
  const navigate = useNavigate();
  const filters = [
    ["all", "The whole party"],
    ["quick", "5-minute fix"],
    ["creative", "Make something"],
    ["voting", "Low pressure"],
    ["trivia", "Brain & speed"],
  ];
  const visible = GAMES.filter(
    (g) =>
      (filter === "all" ||
        (filter === "quick" && g.minutes <= 4) ||
        g.category === filter) &&
      (energy === "all" || g.energy === energy) &&
      (time === "all" || g.minutes <= Number(time)),
  );
  return (
    <>
      <section className="page-hero">
        <Tag>RUCKUS ORIGINALS / SIX WAYS TO MAKE A SCENE.</Tag>
        <h1>
          Find your
          <br />
          <span>kind of loud.</span>
        </h1>
        <p>
          The fast thinkers. The wild pitchers. The terrible artists.
          <br />
          There’s a place for everyone at this party.
        </p>
      </section>
      <section className="section library">
        <div className="filter-tabs" role="group" aria-label="Filter games">
          {filters.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="discovery-tools">
          <label>
            Room energy
            <select value={energy} onChange={(e) => setEnergy(e.target.value)}>
              <option value="all">Every energy</option>
              {GAMES.map((g) => (
                <option key={g.id}>{g.energy}</option>
              ))}
            </select>
          </label>
          <label>
            Time to play
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="all">Any length</option>
              <option value="4">About 4 minutes</option>
              <option value="6">Up to 6 minutes</option>
            </select>
          </label>
          <button
            className="button outline"
            disabled={!visible.length}
            onClick={() =>
              navigate(
                `/app/originals/${visible[Math.floor(Math.random() * visible.length)].id}`,
              )
            }
          >
            Surprise me <Icon name="asterisk" />
          </button>
        </div>
        {!visible.length && (
          <div className="studio-empty">
            <p>No games match this mix. Try another energy or time.</p>
            <button
              className="button"
              onClick={() => {
                setFilter("all");
                setEnergy("all");
                setTime("all");
              }}
            >
              Show the whole party
            </button>
          </div>
        )}
        <div className="game-grid">
          {visible.map((g) => (
            <GameCard key={g.id} game={g} index={GAMES.indexOf(g)} />
          ))}
        </div>
      </section>
      <section className="compact-cta">
        <div>
          <span className="eyebrow">YOUR BOARDS + CUSTOM TEMPLATES</span>
          <h2>Make the questions your own.</h2>
          <p>
            Ruckus Studio turns your inside knowledge into live multiplayer.
          </p>
        </div>
        <Link className="button" to="/app/studio">
          Build a board <Icon name="arrow" />
        </Link>
      </section>
      <section className="compact-cta">
        <h2>Can’t pick? Make a mix.</h2>
        {can("boards.launch") && (
          <Link className="button" to="/app/host">
            Build your lineup <Icon name="arrow" />
          </Link>
        )}
      </section>
    </>
  );
}
export function GameDetail() {
  const { can } = useWorkspace();
  const { slug } = useParams();
  if (!GAMES.some((g) => g.id === slug))
    return (
      <section className="page-hero">
        <h1>
          That game
          <br />
          isn’t in the room.
        </h1>
        <Link to="/app/originals" className="button">
          Explore the lineup
        </Link>
      </section>
    );
  const game = gameById(slug ?? "");
  const sample = samples[game.id];
  return (
    <>
      <section className="game-detail-hero" style={{ background: game.color }}>
        <div>
          <Link className="back-link" to="/app/originals">
            ← The whole lineup
          </Link>
          <Tag>{game.energy.toUpperCase()}</Tag>
          <h1>{game.name}</h1>
          <p>{game.description}</p>
          {can("boards.launch") && (
            <Link to={`/app/host?game=${game.id}`} className="button">
              Put it in the room <Icon name="arrow" />
            </Link>
          )}
          <div className="detail-meta">
            <span>2–30 players</span>
            <span>~{game.minutes} minutes</span>
            <span>3 rounds by default</span>
          </div>
        </div>
        <Icon name={game.icon} />
      </section>
      <section className="section detail-how">
        <div>
          <span className="eyebrow">HERE’S THE DEAL.</span>
          <h2>{game.short}</h2>
          <p>{game.rule}</p>
          <ol className="game-flow">
            <li>
              {game.category === "creative"
                ? "Get the prompt on your phone."
                : "Read the prompt on the big screen."}
            </li>
            <li>
              {game.id === "scribble-shift"
                ? "Draw with your finger, six colors, undo, and an eraser."
                : game.category === "creative"
                  ? "Write your best line before the timer runs out."
                  : "Tap one of four choices before the clock runs out."}
            </li>
            <li>
              {game.category === "creative"
                ? "Anonymous entries appear. Give someone else your vote."
                : "The answers lock. The room gets the reveal."}
            </li>
            <li>
              {game.id === "hotwire"
                ? "Correct answers earn 500–1,000 points, based on speed."
                : game.id === "room-temperature"
                  ? "Every tied majority choice earns 600 points."
                  : game.id === "odd-one-in"
                    ? "Spot the truth and earn 700 points."
                    : "Each vote received earns 300 points."}
            </li>
          </ol>
        </div>
        <div className="sample-round">
          <Tag color={game.color}>A TASTE OF THE GAME</Tag>
          <h3>{sample.title}</h3>
          {game.id === "caption-this" && (
            <img
              src="/scenes/0.svg"
              alt="A pigeon presenting at an office meeting"
            />
          )}
          {sample.body.map((a, i) => (
            <div className="sample-answer" key={a}>
              <span>{game.category === "creative" ? "✳" : "ABCD"[i]}</span>
              {a}
            </div>
          ))}
          <p>Illustrative round. Start a room to play for real.</p>
        </div>
      </section>
      <section className="compact-cta">
        <div>
          <h2>Looks better with people.</h2>
          <p>Our eight-person demo crew is already on standby.</p>
        </div>
        {can("boards.launch") && <DemoButton />}
      </section>
    </>
  );
}
