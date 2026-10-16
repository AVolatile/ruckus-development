import { useEffect, useState } from "react";
import { request } from "../lib/api";
import { useWorkspace } from "../workspaces/context";
import { defaultPackId, type PackSummary } from "../../shared/content-packs";
import type { GameId } from "../../shared/types";
import { Link } from "../workspaces/navigation";
import "./content.css";
export function PackChooser({
  game,
  value,
  onChange,
}: {
  game: GameId;
  value?: string;
  onChange: (id: string) => void;
}) {
  const { current } = useWorkspace(),
    [items, setItems] = useState<PackSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const endpoint = `/api/v1/workspaces/${current.id}/content-packs?game=${game}&status=ready`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    setError("");
    void request<{ items: PackSummary[]; nextCursor: string | null }>(endpoint)
      .then((r) => {
        if (active) {
          setItems(r.items);
          setCursor(r.nextCursor);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
  return (
    <div className="pack-choice">
      <label>
        Content pack
        <select
          disabled={loading}
          value={value ?? defaultPackId(game)}
          onChange={(e) => onChange(e.target.value)}
        >
          {!items.some((i) => i.id === (value ?? defaultPackId(game))) && (
            <option value={value ?? defaultPackId(game)}>
              {loading
                ? "Loading packs…"
                : cursor
                  ? "Selected pack — load more choices to see its name"
                  : value
                    ? "Selected pack unavailable — choose a replacement"
                    : "Default unavailable — choose a ready pack"}
            </option>
          )}
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {i.ownerType === "ruckus" ? "Ruckus" : "Workspace"} ·{" "}
              {i.itemCount} items
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {cursor && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void request<{ items: PackSummary[]; nextCursor: string | null }>(
              `${endpoint}&cursor=${encodeURIComponent(cursor)}`,
            )
              .then((r) => {
                setItems((p) => [...p, ...r.items]);
                setCursor(r.nextCursor);
              })
              .catch((e) => setError(e.message));
          }}
        >
          More packs
        </button>
      )}
      <Link to={`/app/content-packs?game=${game}`}>Explore packs →</Link>
    </div>
  );
}
