import { Link } from "react-router-dom";
import { AVATAR_COLORS, AVATAR_NAMES, GAMES } from "../../../shared/catalog";
import { Avatar, Icon, Logo, Star, Tag } from "../../components/Visuals";
import { GameCard } from "../../components/GameCard";
import { StagePreview } from "../../components/StagePreview";
export function Brand() {
  return (
    <>
      <section className="brand-hero">
        <Tag color="#f6ed51">THE WORLD OF RUCKUS / BRAND SYSTEM 01</Tag>
        <Logo light />
        <p>
          A little mischief.
          <br />A lot of intention.
        </p>
        <Star />
      </section>
      <section className="section brand-strategy">
        <span className="eyebrow">01 / THE IDEA</span>
        <div className="section-heading">
          <h2>
            Permission to
            <br />
            make some noise.
          </h2>
          <p>
            Ruckus is a confident, slightly mischievous alternative to awkward
            workplace icebreakers. It’s built for adults who don’t need
            instructions on how to have fun—just an easy way to start.
          </p>
        </div>
        <div className="brand-principles">
          <div>
            <h3>The name</h3>
            <p>
              A good-natured commotion. Short enough to shout across a room,
              expressive enough to build a whole world around.
            </p>
          </div>
          <div>
            <h3>The promise</h3>
            <p>
              Clock out of ordinary. Turn the conference-room screen into a
              shared experience worth joining.
            </p>
          </div>
          <div>
            <h3>The personality</h3>
            <p>
              Clever, social, energetic. Playfully competitive. Always friendly.
              Never an HR policy pretending to be a party.
            </p>
          </div>
        </div>
      </section>
      <section className="section identity-section">
        <span className="eyebrow">02 / MAKE YOUR MARK</span>
        <div className="identity-grid">
          <div className="wordmark-panel">
            <Logo />
            <p>Bricolage Grotesque. Heavyweight. Unapologetically lowercase.</p>
            <a href="/brand/wordmark.svg" download>
              Download vector wordmark ↗
            </a>
          </div>
          <div className="symbol-panel">
            <img src="/brand/symbol.svg" alt="Ruckus R symbol with spark" />
            <p>An R in motion, punctuated by a spark.</p>
            <a href="/brand/symbol.svg" download>
              Download symbol ↗
            </a>
          </div>
        </div>
      </section>
      <section className="section">
        <span className="eyebrow">03 / LOUD, IN ALL THE RIGHT PLACES</span>
        <h2 className="section-title">The color of a good time.</h2>
        <div className="palette-grid">
          {[
            { name: "Electric blue", hex: "#2548F4", light: true },
            { name: "After-hours yellow", hex: "#F6ED51" },
            { name: "Paper", hex: "#F9F7ED" },
            { name: "Ink", hex: "#191A24", light: true },
            { name: "Pink slip", hex: "#FFA9D2" },
            { name: "Fresh start", hex: "#C0EE7B" },
            { name: "Hot take", hex: "#FF7448" },
            { name: "Clear skies", hex: "#A9D9F6" },
          ].map((c) => (
            <div
              key={c.hex}
              style={{
                background: c.hex,
                color: c.light ? "#f9f7ed" : "#191a24",
              }}
            >
              <Star />
              <b>{c.name}</b>
              <span>{c.hex}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="section type-section">
        <span className="eyebrow">04 / SAY IT LIKE YOU MEAN IT</span>
        <div className="type-specimen">
          <div>
            <span>DISPLAY / BRICOLAGE GROTESQUE</span>
            <h2>
              Make a<br />
              little ruckus.
            </h2>
            <p>
              Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm
              <br />
              0123456789 ↗ ! ? &
            </p>
          </div>
          <div>
            <span>INTERFACE / DM SANS</span>
            <h3>
              Good company.
              <br />
              Questionable competition.
            </h3>
            <p>
              Clear at thumb distance. Readable across the room. Big numbers,
              short instructions, generous space.
            </p>
            <p className="score-specimen">+1,000</p>
          </div>
        </div>
      </section>
      <section className="section avatar-system">
        <span className="eyebrow">05 / THE USUAL SUSPECTS</span>
        <h2 className="section-title">
          Twenty faces.
          <br />
          Zero profile photos.
        </h2>
        <p>
          Original vector characters with distinct silhouettes and a shared ink
          line.
          <br />A little stranger than your work headshot. Much more
          competitive.
        </p>
        <div className="brand-avatars">
          {AVATAR_NAMES.map((name, id) => (
            <a
              href={`/avatars/${id}.svg`}
              download
              key={id}
              style={{ background: AVATAR_COLORS[id] }}
            >
              <Avatar id={id} size={100} />
              <span>{name} ↗</span>
            </a>
          ))}
        </div>
      </section>
      <section className="section">
        <span className="eyebrow">06 / FROM BRAND TO PLAY</span>
        <h2 className="section-title">
          One world.
          <br />
          Every touchpoint.
        </h2>
        <div className="brand-ui">
          <div className="brand-buttons">
            <h3>Buttons with somewhere to go.</h3>
            <Link className="button" to="/host">
              Start a ruckus <Icon name="arrow" />
            </Link>
            <Link className="button yellow" to="/join">
              Make an entrance <Icon name="arrow" />
            </Link>
            <Tag color="#c0ee7b">ANSWER LOCKED ✓</Tag>
            <h3>Icons, with a point.</h3>
            <div className="brand-icons">
              {GAMES.map((g) => (
                <Icon key={g.id} name={g.icon} />
              ))}
            </div>
          </div>
          <GameCard game={GAMES[2]} index={2} />
        </div>
        <StagePreview />
      </section>
      <section className="section motion-section">
        <span className="eyebrow">07 / A BRAND THAT DOESN’T SIT STILL</span>
        <div className="section-heading">
          <h2>
            A little entrance.
            <br />A big reveal.
          </h2>
          <p>
            Avatars arrive with a spring. Answer bars grow into the reveal.
            Scores get a lift. Confetti waits for the final winner.
            Reduced-motion preferences quiet the whole system.
          </p>
        </div>
        <div className="brand-principles">
          <div>
            <Icon name="bolt" />
            <h3>Motion</h3>
            <p>
              180ms for feedback. 420ms for entrances. Ease-out for momentum.
              Never hide information behind animation.
            </p>
          </div>
          <div>
            <Icon name="bubble" />
            <h3>Sound</h3>
            <p>
              Original, low-volume Web Audio tones for joins, transitions,
              reveals, and wins. Muted by default. Controlled by the host.
            </p>
          </div>
          <div>
            <Icon name="eye" />
            <h3>Voice</h3>
            <p>
              “Answer locked. Lovely.” “Good ruckus.” Errors are specific, calm,
              and useful. Save the joke for when it helps.
            </p>
          </div>
        </div>
      </section>
      <section className="compact-cta">
        <h2>Good brands leave the room.</h2>
        <Link to="/campaign" className="button">
          See the campaign <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
