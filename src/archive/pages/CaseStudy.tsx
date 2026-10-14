import { Link } from "react-router-dom";
import { GAMES } from "../../../shared/catalog";
import { Avatar, Icon, Logo, Tag } from "../../components/Visuals";
import { GameCard } from "../../components/GameCard";
import { StagePreview } from "../../components/StagePreview";
import { DemoButton } from "../../components/DemoButton";
export function CaseStudy() {
  return (
    <>
      <section className="case-hero">
        <Tag color="#f6ed51">ANTHONY VOLATILE / VOLATILE SOLUTIONS</Tag>
        <h1>
          From workplace
          <br />
          screen to
          <br />
          <span>shared scene.</span>
        </h1>
        <p>Ruckus — a real-time multiplayer party-game concept.</p>
        <div className="case-disciplines">
          Brand strategy · Game design · Product design
          <br />
          Real-time development · Frontend engineering · Motion · Campaign
        </div>
        <DemoButton className="button yellow" />
      </section>
      <section className="section case-overview">
        <span className="eyebrow">01 / THE OPPORTUNITY</span>
        <div className="section-heading">
          <h2>
            The room already
            <br />
            has everything it needs.
          </h2>
          <p>
            A screen. Phones. People. Workplace social time often defaults to
            trivia slides or a personal fun fact. Ruckus turns those existing
            devices into a shared game, without adding accounts or asking people
            to disclose anything about themselves.
          </p>
        </div>
        <StagePreview />
      </section>
      <section className="section case-design">
        <span className="eyebrow">02 / TWO SCREENS, TWO JOBS</span>
        <div className="case-screen-grid">
          <div>
            <Icon name="screen" />
            <h2>
              The host sets
              <br />
              the scene.
            </h2>
            <p>
              Large prompts. A real join QR. Avatars that arrive live. A
              readable timer. Results everyone can see. The screen is a game
              stage, with controls tucked into a presenter toolbar and drawer.
            </p>
          </div>
          <div>
            <Icon name="phone" />
            <h2>
              The phone makes
              <br />
              it personal.
            </h2>
            <p>
              Name, avatar, and controller in one flow. Big answer buttons,
              short text fields, normalized vector drawing, one vote per person,
              and a clear confirmation. Brief drops and refreshes restore the
              same identity.
            </p>
          </div>
        </div>
      </section>
      <section className="section architecture-story">
        <span className="eyebrow">03 / THE REAL-TIME SYSTEM</span>
        <h2 className="section-title">
          One room.
          <br />
          One source of truth.
        </h2>
        <div className="system-diagram">
          <div>
            <Icon name="screen" />
            <b>HOST</b>
            <span>Control & present</span>
          </div>
          <span>↔</span>
          <div className="system-server">
            <Icon name="asterisk" />
            <b>NODE + SOCKET.IO</b>
            <span>Rooms · timers · validation · scoring</span>
          </div>
          <span>↔</span>
          <div>
            <Icon name="phone" />
            <b>PLAYERS</b>
            <span>Join · submit · vote · react</span>
          </div>
        </div>
        <div className="brand-principles">
          <div>
            <h3>Server authority</h3>
            <p>
              Clients send intent. The room engine validates the role, active
              phase, eligibility, deadline, and input type. Scores and round
              transitions happen on the server.
            </p>
          </div>
          <div>
            <h3>A disciplined lifecycle</h3>
            <p>
              Lobby → intro → active → voting or reveal → intermission → final.
              Pause stops the server timer and bot tasks. Anonymous entries only
              become public when voting opens.
            </p>
          </div>
          <div>
            <h3>Recoverable identities</h3>
            <p>
              Per-tab session storage holds a room code and random token.
              Reconnect attaches to the existing player or host. Removed players
              cannot resume. Rooms expire in memory.
            </p>
          </div>
        </div>
        <p className="technical-note">
          React · TypeScript · Express · Socket.IO · Zod · SVG drawing · QR
          generation. One service in local development; Netlify frontend and a
          persistent Node realtime service in production.
        </p>
      </section>
      <section className="section">
        <span className="eyebrow">04 / SIX DIFFERENT WAYS IN</span>
        <h2 className="section-title">
          Mechanics that
          <br />
          make the room talk.
        </h2>
        <div className="game-grid">
          {GAMES.map((g, i) => (
            <GameCard game={g} index={i} key={g.id} />
          ))}
        </div>
      </section>
      <section className="demo-banner">
        <div>
          <Tag>05 / THE DEMO WITHOUT A CROWD</Tag>
          <h2>
            Eight coworkers.
            <br />
            Zero scheduling.
          </h2>
          <p>
            Prewritten, work-safe bots respond at varied delays, submit pitches
            and captions, draw vector doodles, vote without choosing their own
            entries, and earn actual scores. A recruiter can experience a full
            session alone.
          </p>
          <DemoButton className="button yellow" />
        </div>
        <Avatar id={14} size={200} />
      </section>
      <section className="section">
        <span className="eyebrow">06 / A WORLD BEYOND THE INTERFACE</span>
        <div className="section-heading">
          <h2>
            Brand is part
            <br />
            of the interaction.
          </h2>
          <p>
            Cobalt and acid yellow frame the stage. Game colors help orient
            players. Twenty original avatars make joining memorable. Fifteen
            original illustrations turn caption rounds into a custom visual
            world.
          </p>
        </div>
        <div className="case-brand-links">
          <Link to="/brand">
            <Logo />
            <h3>The identity system ↗</h3>
            <p>Color, typography, avatars, icons, UI, motion, and voice.</p>
          </Link>
          <Link to="/campaign">
            <h2>
              No fun facts
              <br />
              were harmed.
            </h2>
            <h3>The campaign system ↗</h3>
            <p>
              Posters, social, display ads, emails, and an activation concept.
            </p>
          </Link>
        </div>
      </section>
      <section className="section case-quality">
        <span className="eyebrow">07 / BUILT FOR ACTUAL PEOPLE</span>
        <div className="brand-principles">
          <div>
            <h3>Accessible participation</h3>
            <p>
              Keyboard-friendly controls, visible focus, labeled inputs, text
              alongside answer letters, reduced motion, muted audio by default,
              relaxed timers, and clear state feedback. Drawing also supports
              keyboard input.
            </p>
          </div>
          <div>
            <h3>Room-level moderation</h3>
            <p>
              Host-only actions use a private token. Lock joins, remove players,
              and end the room. Basic text filtering, schema validation, payload
              limits, and reaction/input rate limits support the prototype.
            </p>
          </div>
          <div>
            <h3>Honest scope</h3>
            <p>
              Single-process, in-memory rooms. No accounts, billing, analytics,
              customer claims, or permanent score storage. Local/LAN multiplayer
              works without an external database. Public remote play needs a
              persistent Node host.
            </p>
          </div>
        </div>
      </section>
      <section className="section case-studio">
        <span className="eyebrow">
          PHASE 2 / FROM GAME LIBRARY TO GAME PLATFORM
        </span>
        <div className="section-heading">
          <h2>
            Now the room
            <br />
            writes the questions.
          </h2>
          <p>
            Phase one established six Originals and a live host/phone ecosystem.
            Studio extends the same engine with locally saved question boards,
            an accessible answer editor, live previews, validated JSON/CSV
            transfer, and server-scored custom sessions.
          </p>
        </div>
        <div className="brand-principles">
          <div>
            <h3>A creator’s seat</h3>
            <p>
              Question rails, correct-answer marking, timers, scoring, and
              previews of both screens. Browser storage sits behind a repository
              interface for a future shared library.
            </p>
          </div>
          <div>
            <h3>A protected game snapshot</h3>
            <p>
              Launching sends a validated board to the server. Phones receive
              only the current question and choices. Answer truth is stripped
              from the live payload until reveal.
            </p>
          </div>
          <div>
            <h3>A public topology</h3>
            <p>
              Netlify hosts the frontend. A persistent Node service runs
              Socket.IO. Public join links point to the frontend, with
              configurable secure realtime connections behind it.
            </p>
          </div>
        </div>
        <Link to="/studio" className="button">
          Try the creator workflow <Icon name="arrow" />
        </Link>
      </section>
      <section className="case-disclaimer">
        <p>
          This is a self-initiated concept project created to demonstrate
          multiplayer product design, game mechanics, real-time frontend
          engineering, brand strategy, motion, and campaign execution.
        </p>
        <Link to="/host" className="button">
          Experience the build <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
