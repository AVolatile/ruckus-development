import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { gameById, gameForRoom, REACTIONS } from "../../shared/catalog";
import { useParty } from "../lib/party";
import { Avatar, Confetti, Icon, Logo, Tag } from "../components/Visuals";
import { Timer, Scoreboard } from "../components/RoomParts";
import { PlayerInput, PlayerVoting } from "../components/ControllerInputs";
import { ErrorMessage } from "../components/Layout";
import { EventLive, EventBanner } from "../events/EventLive";
export function PlayerRoom() {
  const party = useParty(),
    { code } = useParams(),
    room = party.room;
  const [cooldown, setCooldown] = useState(false);
  if (!room || room.code !== code || party.identity?.role !== "player")
    return (
      <div className="join-page room-recovery">
        <Logo />
        <Avatar id={2} size={120} />
        <h1>
          {party.error ? "You’re between parties." : "Finding your room…"}
        </h1>
        <ErrorMessage message={party.error} />
        <Link to={`/join?room=${code ?? ""}`} className="button">
          Join the room <Icon name="arrow" />
        </Link>
      </div>
    );
  if (room.event && room.event.state !== "GAME_ACTIVE")
    return <EventLive room={room} />;
  const player = room.players.find((p) => p.id === room.you);
  const game = gameForRoom(room);
  if (!player) return null;
  const rank =
    [...room.players]
      .sort((a, b) => b.score - a.score)
      .findIndex((p) => p.id === player.id) + 1;
  return (
    <div className={`player-screen phase-${room.phase}`}>
      {room.event && <EventBanner room={room} />}
      <header className="player-header">
        <Logo />
        <span>
          ROOM <b>{code}</b>
        </span>
      </header>
      {!party.connected && (
        <div className="connection-banner" role="status">
          Reconnecting… Your player and score are saved.
        </div>
      )}
      {!room.hostConnected && room.phase !== "ended" && (
        <div className="connection-banner" role="status">
          The host is reconnecting. Stay here; your game is still running.
        </div>
      )}
      <div className="player-identity">
        <Avatar id={player.avatar} size={42} />
        <b>{player.name}</b>
        <span>
          {room.board?.scoring === false ? (
            "JUST HERE TO PLAY"
          ) : (
            <>
              #{rank} <strong>{player.score.toLocaleString()}</strong> pts
            </>
          )}
        </span>
      </div>
      <main className="player-main">
        {room.phase === "lobby" && (
          <div className="player-lobby">
            <Tag color="#c0ee7b">YOU MADE IT.</Tag>
            <Avatar id={player.avatar} size={185} />
            <h1>
              {player.name},<br />
              you’re in.
            </h1>
            <p>
              Look up. Make eye contact.
              <br />
              Pretend you’re not already planning to win.
            </p>
            <div className="waiting-note">
              <span className="live-dot" /> Waiting for the host to start
            </div>
            <div className="player-lobby-crew">
              {room.players.slice(0, 8).map((p) => (
                <Avatar key={p.id} id={p.avatar} size={38} />
              ))}
              <span>{room.players.length} in the room</span>
            </div>
          </div>
        )}
        {room.phase === "intro" && (
          <div className="player-intro">
            <Tag color={game.color}>NEXT UP</Tag>
            <Icon name={game.icon} />
            <h1>{game.name}</h1>
            <p>{game.rule}</p>
            <Timer room={room} />
            <span className="waiting-note">
              Game faces on. Starting shortly.
            </span>
          </div>
        )}
        {room.phase === "active" && (
          <>
            <div className="player-round-heading">
              <Tag color={game.color}>
                {game.name} / {room.round + 1}
              </Tag>
              <Timer room={room} />
            </div>
            <h1 className="player-prompt">{room.prompt?.title}</h1>
            {room.prompt?.scene !== undefined && !room.ownSubmission && (
              <img
                className="player-scene"
                src={`/scenes/${room.prompt.scene}.svg`}
                alt={room.prompt.title}
              />
            )}
            <PlayerInput
              room={room}
              key={`${room.event?.segmentIndex ?? 0}-${room.gameIndex}-${room.round}`}
            />
          </>
        )}
        {room.phase === "voting" && (
          <>
            <div className="player-round-heading">
              <Tag color={game.color}>TIME TO VOTE</Tag>
              <Timer room={room} />
            </div>
            <h1 className="player-prompt">
              Who gets
              <br />
              the spotlight?
            </h1>
            <p className="voting-help">
              Anonymous entries. One vote. Make it count.
            </p>
            <PlayerVoting
              room={room}
              key={`${room.event?.segmentIndex ?? 0}-${room.gameIndex}-${room.round}`}
            />
          </>
        )}
        {room.phase === "results" && (
          <div className="player-results">
            <Tag color={game.color}>THE REVEAL</Tag>
            <Avatar id={player.avatar} size={125} />
            <h1>
              {room.prompt?.questionType === "poll"
                ? "Opinion delivered."
                : room.prompt?.scoreMode === "no-score"
                  ? "Just here to play."
                  : player.delta > 0
                    ? `+${player.delta}`
                    : "Fresh round ahead."}
            </h1>
            <p>
              {player.delta > 0
                ? "That’s a very good look on you."
                : "The best comeback stories start here."}
            </p>
            {room.prompt?.options && (
              <div className="player-correct">
                <b>
                  {game.id === "room-temperature"
                    ? "THE ROOM PICKED"
                    : "THE REAL ANSWER"}
                </b>
                {room.correct.map((i) => (
                  <span key={i}>{room.prompt?.options?.[i]}</span>
                ))}
                <p>{room.prompt.explanation}</p>
              </div>
            )}
            <div className="personal-rank">
              #{rank} in the room · {player.score.toLocaleString()} points
            </div>
            <p className="waiting-note">Look up for everyone’s results.</p>
          </div>
        )}
        {room.phase === "intermission" && (
          <>
            <Tag color="#f6ed51">BREATHER, NOT A MEETING.</Tag>
            <h1 className="player-prompt">
              Next up:
              <br />
              {gameById(room.settings.playlist[room.gameIndex + 1]).name}
            </h1>
            <Scoreboard players={room.players} compact />
          </>
        )}
        {room.phase === "final" && (
          <div className="player-final">
            {rank === 1 && <Confetti />}
            <Tag color="#f6ed51">THAT WAS A GOOD RUCKUS.</Tag>
            <Avatar id={player.avatar} size={150} />
            <h1>
              {room.board?.scoring === false
                ? "Great company. Strong opinions."
                : rank === 1
                  ? "Room royalty."
                  : `A very good #${rank}.`}
            </h1>
            <p>
              {room.board?.scoring === false
                ? "Every opinion counted."
                : `${player.score.toLocaleString()} points. Great company.`}
              <br />
              The host can start a rematch.
            </p>
            <Scoreboard players={room.players} compact />
          </div>
        )}
        {room.phase === "ended" && (
          <div className="player-confirmation">
            <Avatar id={19} size={150} />
            <h1>
              The room’s closed.
              <br />
              The stories aren’t.
            </h1>
            <p>Your host ended the session. Thanks for bringing the Ruckus.</p>
            <Link to="/join" className="button full">
              Join another room <Icon name="arrow" />
            </Link>
          </div>
        )}
        <ErrorMessage message={party.error} />
        {room.paused && (
          <div className="pause-notice" role="status">
            Ⅱ A brief pause. The host will get things moving.
          </div>
        )}
      </main>
      {room.settings.reactions && room.phase !== "ended" && (
        <footer className="player-reactions">
          <span>EXPRESS YOURSELF. RESPONSIBLY.</span>
          <div>
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                disabled={cooldown || !party.connected}
                aria-label={`React ${emoji}`}
                onClick={() => {
                  party.reaction(emoji);
                  setCooldown(true);
                  setTimeout(() => setCooldown(false), 2000);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
