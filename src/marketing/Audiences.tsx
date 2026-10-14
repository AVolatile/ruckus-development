import { Link } from "react-router-dom";
import { Avatar, Icon, Tag } from "../components/Visuals";
export function Audience({ events = false }: { events?: boolean }) {
  const occasions = events
    ? [
        [
          "COMPANY PARTIES",
          "Give the party a plot.",
          "Mix a few Originals, put the lobby on the big screen, and let everyone pick a competitive side.",
        ],
        [
          "CONFERENCES & OFFSITES",
          "Beyond the name tags.",
          "Warm up a group or close a session with a short game. Keep each live room to 30 players.",
        ],
        [
          "WEDDINGS & FRIENDS",
          "Make it personal.",
          "Build trivia about your people, add a few polls, and find out who was paying attention.",
        ],
      ]
    : [
        [
          "TEAM SOCIALS",
          "A better Friday finish.",
          "Close the tabs. Open an Original. Ten minutes of shared competition beats another round of introductions.",
        ],
        [
          "ONBOARDING",
          "Company lore, meet game night.",
          "Write your own company trivia and easy polls in Studio. Help new people join the conversation.",
        ],
        [
          "OFFSITES & KICKOFFS",
          "Give the agenda an outro.",
          "Bring your sales kickoff, internal event, or offsite together around a shared screen.",
        ],
      ];
  return (
    <>
      <section className="teams-hero">
        <div>
          <Tag>
            {events
              ? "GOOD PEOPLE. GREAT OCCASION."
              : "GOOD COMPANY. BETTER COMPETITION."}
          </Tag>
          <h1>
            {events ? (
              <>
                Make it
                <br />
                <span>an occasion.</span>
              </>
            ) : (
              <>
                Less small talk.
                <br />
                <span>More Ruckus.</span>
              </>
            )}
          </h1>
          <p>
            {events
              ? "Company parties, conferences, holiday gatherings, weddings, and nights with friends. Bring a screen. We’ll bring the game mode."
              : "Live games for team socials, onboarding, offsites, and the gaps worth filling. Phones out. Job titles optional."}
          </p>
          <Link to="/signup" className="button">
            Start free <Icon name="arrow" />
          </Link>
        </div>
        <div className="team-avatar-wall">
          {[1, 5, 3, 14, 11, 9, 7, 19, 12].map((id, i) => (
            <div
              key={id}
              style={{ background: ["#a9d9f6", "#ffa9d2", "#c0ee7b"][i % 3] }}
            >
              <Avatar id={id} size={120} />
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>
            {events
              ? "Your people. Your moment."
              : "For people, not job titles."}
          </h2>
          <p>
            One host. One shared screen.
            <br />
            Players join without accounts.
          </p>
        </div>
        <div className="occasion-grid">
          {occasions.map(([label, title, text]) => (
            <article className="occasion" key={label}>
              <span className="eyebrow">{label}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section practical-note">
        <h2>
          {events
            ? "Different places. Same room."
            : "Your team’s next chapter."}
        </h2>
        <p>
          {events
            ? "Playing remotely? Share the host screen on your existing video call. Everyone keeps their phone as a controller. Live rooms support up to 30 players; scheduled events and reusable event branding are planned."
            : "Custom boards and live rooms work today. Shared organization workspaces and reusable Brand Kits are planned, so future hosts can make an event feel like their own."}
        </p>
      </section>
      <section className="compact-cta">
        <div>
          <h2>Make the questions your own.</h2>
          <p>Trivia, polls, templates, and your room’s inside knowledge.</p>
        </div>
        <Link to="/app/studio" className="button">
          Open Studio <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
