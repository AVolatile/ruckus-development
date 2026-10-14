import { Link } from "react-router-dom";
import { Tag } from "../components/Visuals";
export function Resources() {
  return (
    <>
      <section className="page-hero">
        <Tag>FIELD NOTES FOR THE PARTY STARTER</Tag>
        <h1>
          Host with
          <br />
          <span>the most.</span>
        </h1>
        <p>A little preparation. A much better room.</p>
      </section>
      <section className="section resource-list">
        {[
          [
            "The first five minutes",
            "Open a room before people arrive. Keep the lobby on your display. Start with Room Temperature: easy to join, impossible to be objectively wrong.",
          ],
          [
            "Your phone is the controller",
            "Hosting and playing? Keep the host tab on the shared display, then join from your phone or a separate player tab. Every player picks a name and character.",
          ],
          [
            "Check the connection",
            "Make sure the stage and player phones can open Ruckus before your event. If a QR code won’t scan, enter the room code on the join page.",
          ],
          [
            "Make space for different players",
            "Use relaxed timers when people need more time. Read prompts aloud. No game requires personal facts or being good at drawing.",
          ],
          [
            "Keep it friendly",
            "Choose content that fits your group. The host can lock joins, remove a player, pause, or end the room from Host controls.",
          ],
          [
            "Know your shortcuts",
            "Space advances the round. P pauses, M toggles sound, F opens full screen, and H opens host controls. Sound starts muted.",
          ],
          [
            "Keep a copy of your boards",
            "Boards save in this browser. Export a backup in Studio before clearing browser data or moving to another device.",
          ],
        ].map(([title, body], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="compact-cta">
        <h2>You’ve got this.</h2>
        <Link to="/app/host" className="button">
          Host your first room ↗
        </Link>
      </section>
    </>
  );
}
