import { Link } from "react-router-dom";
import { Icon, Tag } from "./Visuals";
import type { GameInfo } from "../../shared/types";
export function GameCard({
  game,
  index = 0,
  to,
}: {
  game: GameInfo;
  index?: number;
  to?: string;
}) {
  return (
    <Link
      to={to ?? `/app/originals/${game.id}`}
      className={`game-card game-card-${index % 3}`}
      style={{ background: game.color }}
    >
      <div className="game-card-top">
        <Tag>
          {game.category === "creative"
            ? "Make & vote"
            : game.category === "voting"
              ? "Read the room"
              : "Brain & speed"}
        </Tag>
        <span>0{index + 1}</span>
      </div>
      <div className="game-card-art">
        <Icon name={game.icon} />
        <span className="orbit-line" />
      </div>
      <h3>{game.name}</h3>
      <p>{game.short}</p>
      <div className="game-card-bottom">
        <span>2–30 players · ~{game.minutes} min</span>
        <Icon name="arrow" />
      </div>
    </Link>
  );
}
