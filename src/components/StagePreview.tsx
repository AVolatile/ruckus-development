import { useState } from "react";
import { Avatar, Logo, Star } from "./Visuals";
export function StagePreview() {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="hero-playground">
      <span className="preview-label">
        <span className="live-dot" /> ONE SCREEN. EVERYONE IN.
      </span>
      <div className="preview-stage">
        <div className="preview-stage-header">
          <Logo light />
          <span>
            ROOM TEMP. <span className="mini-pill">01 / 03</span>
          </span>
        </div>
        <div className="preview-stage-body">
          <span className="preview-eyebrow">THE ROOM HAS OPINIONS.</span>
          <h2>
            Pick the office
            <br />
            mascot.
          </h2>
          <div className="preview-answers">
            {["Pigeon", "Raccoon", "Tired robot", "Stapler"].map((a, i) => (
              <button
                key={a}
                className={pick === i ? "selected" : ""}
                onClick={() => setPick(i)}
              >
                <span>{"ABCD"[i]}</span>
                {a}
                {pick === i && <b>✓</b>}
              </button>
            ))}
          </div>
          <p className="preview-feedback" aria-live="polite">
            {pick === null
              ? "Go on. Tap an answer."
              : pick === 0
                ? "Excellent. Upper management material."
                : pick === 1
                  ? "Great at scavenging the snack budget."
                  : pick === 2
                    ? "Already knows how we feel on Mondays."
                    : "Finally, someone holding it together."}
          </p>
        </div>
        <div className="preview-stage-players">
          {[1, 3, 5, 7, 14].map((id, i) => (
            <div key={id}>
              <Avatar id={id} size={45} />
              <span>{["Maya", "Jordan", "Priya", "Mateo", "You"][i]}</span>
            </div>
          ))}
          <span className="preview-plus">+ your people</span>
        </div>
      </div>
      <div className="hero-phone">
        <div className="phone-speaker" />
        <div className="phone-top">
          <Logo />
          <span>J7KM5</span>
        </div>
        <span className="phone-status">YOU’RE IN.</span>
        <Avatar id={5} size={104} />
        <h3>
          Nice to meet
          <br />
          your competitive side.
        </h3>
        <div className="phone-answer">
          {pick !== null ? "Answer locked. ✓" : "Your phone. Your controller."}
        </div>
        <div className="phone-reactions">👏 🔥 👀</div>
      </div>
      <div className="sticker no-download">
        ZERO
        <br />
        DOWNLOADS.
        <Star />
      </div>
      <div className="sticker meeting-sticker">
        Meeting mode
        <br />
        <s>ON</s> <b>OFF ↗</b>
      </div>
      <Avatar id={1} size={93} className="floating-bandit" />
      <Star className="hero-star" />
      <span className="hero-scribble">
        Phones out.
        <br />
        Game faces on. <span>↗</span>
      </span>
    </div>
  );
}
