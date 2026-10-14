import { useState } from "react";
import { Avatar, Tag } from "../../components/Visuals";
import { DemoButton } from "../../components/DemoButton";
const campaignLines = [
  "Your agenda just got a plot twist.",
  "The projector has a personality now.",
  "No fun facts were harmed.",
  "Reply all. Play all.",
  "The only meeting worth running over.",
  "Same Wi-Fi. Different wavelength.",
  "Bragging rights. No paperwork.",
  "A little less agenda. A lot more Ruckus.",
];
export function Campaign() {
  const [format, setFormat] = useState("square");
  return (
    <>
      <section className="campaign-hero">
        <Tag color="#f6ed51">RUCKUS, OUT IN THE WILD.</Tag>
        <h1>
          No fun facts
          <br />
          were <span>harmed.</span>
        </h1>
        <p>
          A campaign for the moment someone says,
          <br />
          “We’ve got a few minutes before the next session.”
        </p>
        <Avatar id={5} size={210} />
      </section>
      <section className="section">
        <span className="eyebrow">01 / THE CREATIVE TERRITORIES</span>
        <div className="campaign-lines">
          {campaignLines.map((line, i) => (
            <div key={line}>
              <span>0{i + 1}</span>
              <h2>{line}</h2>
              <p>
                {
                  [
                    "Make the calendar gap an invitation.",
                    "Give the shared screen a new role.",
                    "Remove the pressure to disclose.",
                    "Make remote play feel collective.",
                    "Earn the next round, don’t force it.",
                    "One QR makes a temporary social space.",
                    "Competition without corporate metrics.",
                    "A consistent invitation across every format.",
                  ][i]
                }
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="section poster-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 / OUT OF OFFICE. ON THE WALL.</span>
            <h2>
              Stop the scroll.
              <br />
              Start the room.
            </h2>
          </div>
          <p>
            Original scalable vector posters.
            <br />
            Click any piece to download.
          </p>
        </div>
        <div className="poster-grid">
          {[0, 1, 2, 3, 4].map((i) => (
            <a key={i} href={`/campaign/${i}-poster.svg`} download>
              <img src={`/campaign/${i}-poster.svg`} alt={campaignLines[i]} />
              <span>POSTER 0{i + 1} · 800 × 1120 ↗</span>
            </a>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">03 / SMALL SCREEN. BIG PERSONALITY.</span>
            <h2>
              Made to
              <br />
              make the rounds.
            </h2>
          </div>
          <div
            className="filter-tabs"
            role="group"
            aria-label="Social asset format"
          >
            {[
              ["square", "Square / 1080 × 1080"],
              ["portrait", "Feed / 1080 × 1350"],
              ["story", "Story / 1080 × 1920"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={format === id ? "active" : ""}
                aria-pressed={format === id}
                onClick={() => setFormat(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={`social-grid format-${format}`}>
          {[5, 6, 7].map((i) => (
            <a key={i} href={`/campaign/${i}-${format}.svg`} download>
              <img
                src={`/campaign/${i}-${format}.svg`}
                alt={`${campaignLines[i]} social creative`}
              />
              <span>DOWNLOAD VECTOR ↗</span>
            </a>
          ))}
        </div>
      </section>
      <section className="section display-section">
        <span className="eyebrow">04 / FIT THE SPACE. KEEP THE ATTITUDE.</span>
        <h2 className="section-title">A flexible ad system.</h2>
        <div className="display-grid">
          {[
            ["medium-rectangle", "300 × 250"],
            ["leaderboard", "728 × 90"],
            ["skyscraper", "160 × 600"],
            ["billboard", "970 × 250"],
          ].map(([id, size], i) => (
            <a
              href={`/campaign/${i}-${id}.svg`}
              download
              key={id}
              className={`ad-${id}`}
            >
              <img
                src={`/campaign/${i}-${id}.svg`}
                alt={`${campaignLines[i]} ${size} display ad`}
              />
              <span>{size} · VECTOR ↗</span>
            </a>
          ))}
        </div>
      </section>
      <section className="section email-section">
        <span className="eyebrow">05 / ONE EMAIL WORTH OPENING</span>
        <h2 className="section-title">A better kind of inbox noise.</h2>
        <div className="email-grid">
          {[
            ["launch", "Your conference room has a game mode.", "LAUNCH"],
            ["friday", "Friday needs an outro.", "FRIDAY REMINDER"],
            ["new-game", "Art skills strictly optional.", "GAME DROP"],
            ["party", "One room. Six ways to make a scene.", "OFFICE PARTY"],
            ["remote", "Miles apart. Same loud room.", "REMOTE PLAY"],
          ].map(([id, line, tag]) => (
            <a
              href={`/campaign/email-${id}.html`}
              target="_blank"
              rel="noreferrer"
              key={id}
            >
              <Tag>{tag}</Tag>
              <h3>{line}</h3>
              <p>Open the responsive HTML preview ↗</p>
            </a>
          ))}
        </div>
        <p className="field-help">
          Campaign concepts only. No emails sent. HTML previews use inline
          styles and an editable destination placeholder.
        </p>
      </section>
      <section className="section activation">
        <Avatar id={1} size={180} />
        <div>
          <span className="eyebrow">06 / A ROOM-SIZED ACTIVATION</span>
          <h2>
            The 17-minute
            <br />
            meeting takeover.
          </h2>
          <p>
            A conference break becomes a live three-game mix. Put a branded room
            on the screen, display a join QR, and let the audience create the
            entertainment. A proposed activation built around the actual
            host-and-phone product.
          </p>
          <DemoButton />
        </div>
      </section>
    </>
  );
}
