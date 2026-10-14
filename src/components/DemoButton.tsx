import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Visuals";
import { DEFAULT_SETTINGS } from "../../shared/catalog";
import { useParty } from "../lib/party";
export function DemoButton({
  className = "button",
  children = "Try a demo party",
}: {
  className?: string;
  children?: string;
}) {
  const party = useParty(),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const reply = await party.create(
          { ...DEFAULT_SETTINGS, rounds: 2, pace: "quick" },
          true,
        );
        setBusy(false);
        if (reply.ok && reply.identity)
          navigate(`/room/${reply.identity.code}/host`);
      }}
    >
      {busy ? "Calling the crew…" : children}
      <Icon name="arrow" />
    </button>
  );
}
