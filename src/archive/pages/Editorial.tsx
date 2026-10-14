import { Link, useLocation } from "react-router-dom";
import { Avatar, Icon, Star, Tag } from "../../components/Visuals";
import { StagePreview } from "../../components/StagePreview";
import { DemoButton } from "../../components/DemoButton";
export function HowItWorks() {
  return (
    <>
      <section className="page-hero">
        <Tag>AN EXTREMELY SHORT INSTRUCTION MANUAL.</Tag>
        <h1>
          Screen.
          <br />
          Scan. <span>Scene.</span>
        </h1>
        <p>You can explain this before the coffee’s ready.</p>
      </section>
      <section className="section explainer-steps">
        {[
          {
            n: "01",
            title: "Put a room on the big screen.",
            text: "Open Ruckus on a laptop, conference-room TV, or projector. Choose a Ruckus Original, or make your own question board in Studio. Your room gets a five-character code and a QR code.",
            icon: "screen",
          },
          {
            n: "02",
            title: "Everyone makes an entrance.",
            text: "Scan the QR on your phone. Pick a name and one of twenty alter egos. No download, no account, just your browser.",
            icon: "scan",
          },
          {
            n: "03",
            title: "Your phone takes it from here.",
            text: "Tap answers, write pitches, sketch a masterpiece, and vote. The main screen shows prompts, reveals, points, and the occasional very well-earned reaction.",
            icon: "phone",
          },
          {
            n: "04",
            title: "Collect your bragging rights.",
            text: "The room gets a final scoreboard and awards earned from the actual game. Start a rematch before the winner becomes impossible to live with.",
            icon: "trophy",
          },
        ].map((s) => (
          <article key={s.n}>
            <span>{s.n}</span>
            <Icon name={s.icon} />
            <div>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="section practical-note">
        <h2>A room can reach beyond the room.</h2>
        <p>
          For local play, your computer runs the server and phones join over the
          same Wi-Fi. The lobby generates a LAN join link automatically. The
          public deployment lets phones join over Wi-Fi or cellular. Remote
          hosts share the game screen on their existing video call.
        </p>
        <Link to="/resources" className="button outline">
          The host’s field guide <Icon name="arrow" />
        </Link>
      </section>
      <section className="compact-cta">
        <h2>The manual is over. Playtime isn’t.</h2>
        <DemoButton />
      </section>
    </>
  );
}
export function Teams() {
  const remote = useLocation().pathname === "/remote";
  return (
    <>
      <section className="teams-hero">
        <div>
          <Tag>
            {remote
              ? "DIFFERENT DESKS. SAME RUCKUS."
              : "GOOD COMPANY. BETTER COMPETITION."}
          </Tag>
          <h1>
            {remote ? (
              <>
                Miles apart.
                <br />
                <span>One loud room.</span>
              </>
            ) : (
              <>
                Give the room
                <br />
                <span>a plot twist.</span>
              </>
            )}
          </h1>
          <p>
            {remote
              ? "Share the host screen on your video call. Everyone joins on a phone or a separate browser tab. Your least competitive coworker is about to get very competitive."
              : "The offsite. The Friday finish. The surprisingly short meeting. Give your people something they’ll actually want to join."}
          </p>
          <Link to="/host" className="button">
            {remote ? "Open your remote room" : "Start a ruckus"}{" "}
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="team-avatar-wall">
          {[1, 5, 3, 14, 11, 9, 7, 19, 12].map((a, i) => (
            <div
              key={a}
              style={{ background: ["#a9d9f6", "#ffa9d2", "#c0ee7b"][i % 3] }}
            >
              <Avatar id={a} size={120} />
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>
            {remote
              ? "Your call has a game mode."
              : "For people, not job titles."}
          </h2>
          <p>
            Playful prompts. No personal disclosure.
            <br />
            Everyone gets a way in.
          </p>
        </div>
        <div className="occasion-grid">
          {(remote
            ? [
                [
                  "01",
                  "Share the host screen.",
                  "Use your existing video-call app. Keep its audio open for the good bits between rounds.",
                ],
                [
                  "02",
                  "Keep the controller separate.",
                  "Join on a phone or a second browser tab. The host also plays by opening a separate player tab.",
                ],
                [
                  "03",
                  "Make it internet-ready.",
                  "With the public app, phones join over Wi-Fi or cellular. Hosts share the stage screen on their existing video call.",
                ],
              ]
            : [
                [
                  "THE WARMUP",
                  "Before the agenda.",
                  "Start with Room Temperature. No correct answers, no specialist knowledge, just strong snack opinions.",
                ],
                [
                  "THE OFFSITE",
                  "Beyond the name tags.",
                  "Pair Sellout with Scribble Shift. Creative rounds give the room something new to talk about.",
                ],
                [
                  "THE FRIDAY FINISH",
                  "A better outro.",
                  "A ten-minute mix turns the last calendar gap into the best bit of the week.",
                ],
              ]
          ).map(([label, title, text]) => (
            <article className="occasion" key={title}>
              <span className="eyebrow">{label}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="compact-cta">
        <div>
          <span className="eyebrow">MAKE IT YOUR TEAM’S GAME.</span>
          <h2>Your company trivia. Their competitive streak.</h2>
          <p>
            Build a board for onboarding, a knowledge refresh, an internal
            launch, or your next conference. Start with a template and bring
            your own questions.
          </p>
        </div>
        <Link className="button" to="/studio">
          Open Ruckus Studio <Icon name="arrow" />
        </Link>
      </section>
      <section className="demo-banner">
        <div>
          <h2>
            Bring a phone.
            <br />
            Leave the agenda.
          </h2>
          <DemoButton className="button yellow" />
        </div>
        <Avatar id={remote ? 19 : 5} size={210} />
      </section>
    </>
  );
}
export function Pricing() {
  return (
    <>
      <section className="page-hero">
        <Tag>CONCEPT PRODUCT. REAL PLAY.</Tag>
        <h1>
          The good kind
          <br />
          of <span>free time.</span>
        </h1>
        <p>
          This portfolio edition is free to run and play.
          <br />
          No checkout. No made-up billing flow.
        </p>
      </section>
      <section className="section pricing-panel">
        <div>
          <span className="eyebrow">THE PORTFOLIO EDITION</span>
          <h2>
            $0<span>/ room</span>
          </h2>
          <p>Everything that makes a good Ruckus.</p>
          <Link to="/host" className="button">
            Open a room <Icon name="arrow" />
          </Link>
        </div>
        <ul>
          {[
            "Six fully playable games",
            "Up to 30 players per room",
            "Custom playlists and content packs",
            "20 original avatars",
            "QR-code phone joining",
            "4, 8, or 12 demo players at a time",
            "Anonymous voting and live scoring",
            "Ruckus Studio with custom question boards",
            "LAN play and a deployable internet multiplayer service",
          ].map((t) => (
            <li key={t}>
              <Icon name="check" />
              {t}
            </li>
          ))}
        </ul>
      </section>
      <section className="section practical-note">
        <h2>A business model with room to grow.</h2>
        <p>
          A commercial edition could add custom branded event rooms, licensed
          content packs, and managed hosting. These are future opportunities;
          this build doesn’t charge for features or claim paying customers.
        </p>
        <Link to="/case-study" className="button outline">
          See the thinking behind it <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
export function Resources() {
  return (
    <>
      <section className="page-hero">
        <Tag>FIELD NOTES FOR THE PARTY STARTER.</Tag>
        <h1>
          Host with
          <br />
          <span>the most.</span>
        </h1>
        <p>A little preparation. A much better room.</p>
      </section>
      <section className="section resource-list">
        {[
          {
            n: "01",
            title: "The first five minutes",
            body: "Open the room before your people arrive. Keep the lobby on the display. Start with Room Temperature: it’s easy to join and impossible to be objectively wrong.",
          },
          {
            n: "02",
            title: "Your phone is the controller",
            body: "Use a second browser tab or your phone if you’re hosting and playing. Keep the host tab on the shared display. Every player chooses their own nickname and avatar.",
          },
          {
            n: "03",
            title: "The Wi-Fi check",
            body: "Computer and phones need the same Wi-Fi for local play. Guest networks may block device-to-device access. If the QR doesn’t load, check the printed Phone URL in your terminal and set PUBLIC_APP_URL if necessary.",
          },
          {
            n: "04",
            title: "Make space for different players",
            body: "Use relaxed timers when someone needs more time. Read prompts aloud. Avoid calling on people individually. No game requires sharing personal facts or being good at drawing.",
          },
          {
            n: "05",
            title: "Keep it friendly",
            body: "All prompts are designed for work. User text has a basic filter, but the host remains responsible for the room. Lock joins, remove a player, or end the session from Host controls.",
          },
          {
            n: "06",
            title: "The escape hatch",
            body: "Space advances the round. P pauses the clock. M toggles sound, F opens full screen, and H opens host controls. Sound begins muted. Pausing stops submissions and bot play too.",
          },
        ].map((r) => (
          <article key={r.n}>
            <span>{r.n}</span>
            <div>
              <h2>{r.title}</h2>
              <p>{r.body}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="compact-cta">
        <h2>You’ve got this.</h2>
        <Link to="/host" className="button">
          Host your first room <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
export function About() {
  return (
    <>
      <section className="about-hero">
        <Tag>A SMALL REBELLION AGAINST BORING ROOMS.</Tag>
        <h1>
          We believe in
          <br />
          the power of
          <br />
          <span>“one more round.”</span>
          <Star />
        </h1>
        <p>
          Not every gathering needs another icebreaker.
          <br />
          Sometimes it just needs a screen, a few phones,
          <br />
          and a pigeon with managerial ambitions.
        </p>
      </section>
      <section className="section about-story">
        <Avatar id={5} size={200} />
        <div>
          <span className="eyebrow">
            AN ORIGINAL CONCEPT BY ANTHONY VOLATILE
          </span>
          <h2>
            Design, meet
            <br />
            creative technology.
          </h2>
          <p>
            Ruckus is a self-initiated product concept by Anthony Volatile /
            Volatile Solutions. It brings brand strategy, product design, game
            mechanics, illustration, and real-time engineering into one playable
            experience.
          </p>
          <p>
            The mission is simple: make the screen in the room something
            everyone can play with. The prototype is real. The startup is
            fictional. The competition is entirely up to you.
          </p>
          <Link to="/case-study" className="button outline">
            Behind the build <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="section">
        <StagePreview />
      </section>
    </>
  );
}
