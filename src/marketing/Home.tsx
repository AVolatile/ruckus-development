import { Link } from "react-router-dom";
import { Avatar, Icon, Logo, Star, Tag } from "../components/Visuals";
import { GameCard } from "../components/GameCard";
import { GAMES } from "../../shared/catalog";
import { StagePreview } from "../components/StagePreview";
export function Home() {
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <Tag>
            <span className="live-dot" /> MULTIPLAYER. MINUS THE MEETING.
          </Tag>
          <h1>
            Clock out
            <br />
            of <span className="outlined">ordinary.</span>
            <Star />
          </h1>
          <p>
            Live multiplayer games for teams, events, and your favorite people.
            Turn any shared screen into something the room can play with.
            Players join from their phones.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/signup">
              Start free <Icon name="arrow" />
            </Link>
            <Link className="button text-button" to="/product">
              See how it works <Icon name="arrow" />
            </Link>
          </div>
          <div className="hero-fine">
            <span>✳ 2–30 people</span>
            <span>No player accounts</span>
            <span>Just bring your phone</span>
          </div>
        </div>
        <StagePreview />
      </section>
      <div
        className="ticker"
        aria-label="Six games. Zero awkward introductions."
      >
        <div>
          SIX GAMES <span>✳</span> ZERO AWKWARD INTRODUCTIONS <span>✳</span> BIG
          SCREEN ENERGY <span>✳</span> SMALL SCREEN CONTROLS <span>✳</span> SIX
          GAMES <span>✳</span> ZERO AWKWARD INTRODUCTIONS <span>✳</span>
        </div>
      </div>
      <section className="section how-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE WHOLE SETUP. REALLY.</span>
            <h2>
              From “now what?”
              <br />
              to “one more round.”
            </h2>
          </div>
          <p>
            No downloads. Players skip the signup.
            <br />
            No one introducing their favorite fact
            <br />
            about themselves.
          </p>
        </div>
        <div className="how-steps">
          {[
            {
              n: "01",
              icon: "screen",
              title: "Claim the big screen.",
              body: "Laptop, TV, projector. Open a room and make it the main event.",
            },
            {
              n: "02",
              icon: "scan",
              title: "Scan yourself in.",
              body: "One QR code. Pick a name and a new alter ego. You’re in.",
            },
            {
              n: "03",
              icon: "bolt",
              title: "Let things get lively.",
              body: "Tap, pitch, draw, vote. Your phone does all the heavy lifting.",
            },
          ].map((s) => (
            <div className="how-step" key={s.n}>
              <span className="step-number">{s.n}</span>
              <Icon name={s.icon} />
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="section games-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MEET THE LINEUP</span>
            <h2>
              A little something
              <br />
              for every kind of loud.
            </h2>
          </div>
          <Link className="button outline" to="/product#originals">
            All six games <Icon name="arrow" />
          </Link>
        </div>
        <div className="game-grid">
          {GAMES.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
        </div>
      </section>
      <section className="phone-feature">
        <div className="phone-feature-art">
          <div className="controller-preview">
            <div className="phone-top">
              <Logo />
              <span>HOTWIRE</span>
            </div>
            <Tag color="#ff7448">ROUND 01</Tag>
            <h3>
              What’s the tiny tip
              <br />
              of a shoelace called?
            </h3>
            {["Ferrule", "Aglet", "Grommet", "Toggle"].map((a, i) => (
              <div
                className={`controller-option ${i === 1 ? "is-correct" : ""}`}
                key={a}
              >
                <span>{"ABCD"[i]}</span>
                {a}
                {i === 1 && <span>✓</span>}
              </div>
            ))}
            <span className="phone-caption">
              Look up. Your points are on the big screen.
            </span>
          </div>
          <Avatar id={3} size={130} />
          <Star />
        </div>
        <div className="phone-feature-copy">
          <span className="eyebrow">POCKET-SIZED POWER MOVES</span>
          <h2>
            Your phone
            <br />
            just got a<br />
            <span>better job.</span>
          </h2>
          <p>
            Big, thumb-friendly buttons. A canvas for your questionable art. A
            place for your dangerously good pitches. Everyone gets their own
            controller.
          </p>
          <Link to="/product" className="button yellow">
            See how it works <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="section occasions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">UNREASONABLY GOOD TIMING</span>
            <h2>
              For the gaps
              <br />
              worth filling.
            </h2>
          </div>
          <p>
            There’s a Ruckus-shaped opening
            <br />
            in your calendar.
          </p>
        </div>
        <div className="occasion-grid">
          {[
            {
              time: "10:43 AM",
              title: "The meeting ended early.",
              text: "That’s seventeen minutes you can’t put back in the calendar.",
              avatar: 11,
            },
            {
              time: "FRIDAY, 4:00",
              title: "The week needs an outro.",
              text: "Close the tabs. Open a room. Find out who’s secretly competitive.",
              avatar: 1,
            },
            {
              time: "ANY TIME ZONE",
              title: "Different desks. Same room.",
              text: "Share your screen on the call. Let the phones handle the rest.",
              avatar: 19,
            },
          ].map((o) => (
            <Link
              to={o.avatar === 19 ? "/events" : "/teams"}
              className="occasion"
              key={o.title}
            >
              <span className="eyebrow">{o.time}</span>
              <Avatar id={o.avatar} size={80} />
              <h3>{o.title}</h3>
              <p>{o.text}</p>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      </section>
      <section className="home-studio">
        <div>
          <Tag>INTRODUCING RUCKUS STUDIO</Tag>
          <h2>
            Your questions.
            <br />
            Their competitive side.
          </h2>
          <p>
            Company lore. Snack debates. A specialist subject nobody saw coming.
            Build a question board, preview both screens, and give it a room
            code.
          </p>
          <Link to="/app/studio" className="button">
            Build your own board <Icon name="arrow" />
          </Link>
          <Link to="/product#originals" className="studio-demo-link">
            Explore the Ruckus Originals ↗
          </Link>
        </div>
        <div className="home-studio-card">
          <span>THE CREATOR’S SEAT</span>
          <h3>Friday Team Trivia</h3>
          <div>
            <b>A</b>Things only this team knows <Icon name="check" />
          </div>
          <div>
            <b>B</b>Everyone’s excellent snack opinions
          </div>
          <div>
            <b>C</b>Your next great question
          </div>
          <p>CREATE → PREVIEW → PLAY</p>
        </div>
      </section>
      <section className="final-cta">
        <span className="eyebrow">BRAGGING RIGHTS START HERE.</span>
        <h2>
          Make a little
          <br />
          <span>ruckus.</span>
          <Star />
        </h2>
        <Link className="button" to="/signup">
          Start free <Icon name="arrow" />
        </Link>
        <p>Your host account. Their phones. Let’s make a Ruckus.</p>
      </section>
    </>
  );
}
