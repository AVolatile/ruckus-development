import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import {
  readableForeground,
  type BrandConfig,
  brandContrast,
} from "../../shared/brand";
import { Avatar } from "../components/Visuals";
export default function BrandPreview({
  config,
  workspaceId,
}: {
  config: BrandConfig;
  workspaceId: string;
}) {
  const [screen, setScreen] = useState("Lobby"),
    [qr, setQr] = useState("");
  useEffect(() => {
    void QRCode.toDataURL(`${location.origin}/join`, {
      margin: 1,
      width: 160,
      errorCorrectionLevel: "M",
    }).then(setQr);
  }, []);
  const asset = (id: string) =>
    `/api/v1/workspaces/${workspaceId}/brand-assets/${id}`;
  const foreground = readableForeground(config.primaryColor),
    surfaceForeground = readableForeground(config.surfaceColor);
  const style = {
    "--brand-primary": config.primaryColor,
    "--brand-on-primary": foreground,
    "--brand-surface": config.surfaceColor,
    "--brand-on-surface": surfaceForeground,
    "--brand-accent": config.accentColor,
    "--brand-on-accent": readableForeground(config.accentColor),
    "--brand-secondary": config.secondaryColor,
    "--brand-on-secondary": readableForeground(config.secondaryColor),
  } as CSSProperties;
  return (
    <section className="brand-preview" aria-label="Branded experience preview">
      <div className="section-heading">
        <div>
          <span className="eyebrow">EXPERIENCE PREVIEW</span>
          <h2>Your brand. Their next great room.</h2>
        </div>
      </div>
      <p className="preview-disclaimer">
        Static sample · No room is created. Names and scores are examples.
      </p>
      <div
        className="preview-screen-tabs"
        role="group"
        aria-label="Preview screen"
      >
        {["Lobby", "Join / QR", "Leaderboard", "Winner"].map((label) => (
          <button
            key={label}
            className="button small outline"
            aria-pressed={screen === label}
            onClick={() => setScreen(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="brand-stage" style={style}>
        {config.backgroundAssetId && (
          <img
            className="brand-background"
            src={asset(config.backgroundAssetId)}
            alt=""
          />
        )}
        <div className="brand-stage-content">
          <header>
            {config.logoAssetId ? (
              <img
                className="brand-logo"
                src={asset(config.logoAssetId)}
                alt={`${config.organizationDisplayName} logo`}
              />
            ) : (
              <span className="brand-monogram" aria-hidden="true">
                {config.organizationDisplayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <strong>{config.organizationDisplayName}</strong>
            <span className="brand-sample-tag">SAMPLE</span>
          </header>
          {screen === "Lobby" && (
            <div className="brand-lobby">
              <p className="brand-kicker">GOOD COMPANY. GREAT GAME.</p>
              <h3>
                Your people.
                <br />A little Ruckus.
              </h3>
              <p>The room is getting together.</p>
              <div className="sample-avatars">
                {[1, 3, 5].map((id, i) => (
                  <div key={id}>
                    <Avatar id={id} size={64} />
                    <span>{["Alex", "Sam", "Jo"][i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {screen === "Join / QR" && (
            <div className="brand-join">
              <div>
                <p className="brand-kicker">YOUR PHONE IS YOUR CONTROLLER</p>
                <h3>Everybody in.</h3>
                <p>Scan to open Ruckus Join.</p>
                <strong className="sample-code">ABC123</strong>
                <p>Sample code · no active room</p>
              </div>
              {qr && (
                <img
                  src={qr}
                  alt="QR code to open the public Ruckus join page"
                  width={160}
                  height={160}
                />
              )}
            </div>
          )}
          {screen === "Leaderboard" && (
            <div className="brand-leaderboard">
              <p className="brand-kicker">SAMPLE LEADERBOARD</p>
              <h3>A little friendly rivalry.</h3>
              <ol>
                {[
                  ["Alex", "1,250"],
                  ["Sam", "1,100"],
                  ["Jo", "950"],
                ].map(([name, score], i) => (
                  <li key={name}>
                    <span>
                      {i + 1}. {name}
                    </span>
                    <strong>{score} pts</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {screen === "Winner" && (
            <div className="brand-winner">
              <p className="brand-kicker">SAMPLE RESULTS</p>
              <Avatar id={1} size={100} />
              <h3>Alex takes the room.</h3>
              <strong>1,250 points. One great Ruckus.</strong>
            </div>
          )}
          <footer>
            <span>{config.footerText || "Your people. Your moment."}</span>
            <strong>Powered by Ruckus</strong>
          </footer>
        </div>
      </div>
      <p className="brand-accessibility-note">
        Readable text is derived for each background. Your chosen colors stay
        unchanged.{" "}
        {brandContrast(config)
          .map((p) => `${p.key.replace("Color", "")}: ${p.ratio.toFixed(1)}:1`)
          .join(" · ")}
      </p>
    </section>
  );
}
