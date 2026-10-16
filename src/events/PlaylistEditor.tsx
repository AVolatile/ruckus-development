import type { CSSProperties } from "react";
import { PackChooser } from "../content/PackChooser";
import { GAMES, PACKS } from "../../shared/catalog";
import type { EventDefinition, PlaylistItem } from "../../shared/events";
import type { BoardSummary } from "../../shared/cloud";
import { Icon } from "../components/Visuals";
export function PlaylistEditor({
  definition,
  update,
  boards,
  moreBoards,
  loadBoards,
}: {
  definition: EventDefinition;
  update: (d: EventDefinition) => void;
  boards: BoardSummary[];
  moreBoards: boolean;
  loadBoards: () => void;
}) {
  const items = definition.playlist;
  function change(next: PlaylistItem[]) {
    update({
      ...definition,
      playlist: next.map((item, order) => ({ ...item, order })),
    });
  }
  function patch(index: number, values: Partial<PlaylistItem>) {
    change(
      items.map((item, i) =>
        i === index ? ({ ...item, ...values } as PlaylistItem) : item,
      ),
    );
  }
  const common = () => ({
    itemId: crypto.randomUUID(),
    enabled: true,
    order: items.length,
    displayTitle: "",
    hostNote: "",
    transitionLabel: "",
  });
  return (
    <section className="event-panel event-run-of-show">
      <div className="section-heading">
        <div>
          <span className="eyebrow">02 / PICK YOUR TROUBLE</span>
          <h2>Your lineup.</h2>
          <p>
            {items.filter((i) => i.enabled).length} enabled · up to 50 segments
            · repeated games welcome
          </p>
        </div>
      </div>
      <ol className="event-playlist">
        {items.map((item, index) => {
          const title =
            item.type === "original"
              ? GAMES.find((g) => g.id === item.gameSlug)!.name
              : (boards.find((b) => b.id === item.boardId)?.title ??
                "Studio board · source not loaded");
          return (
            <li
              className={!item.enabled ? "disabled-item" : ""}
              key={item.itemId}
              style={
                {
                  "--segment-accent":
                    item.type === "original"
                      ? GAMES.find((g) => g.id === item.gameSlug)!.color
                      : "var(--blue)",
                  "--segment-ink":
                    item.type === "original" ? "var(--ink)" : "white",
                } as CSSProperties
              }
            >
              <div className="playlist-item-heading">
                <span className="event-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="event-game-icon" aria-hidden="true">
                  <Icon
                    name={
                      item.type === "original"
                        ? GAMES.find((g) => g.id === item.gameSlug)!.icon
                        : "screen"
                    }
                  />
                </span>
                <div>
                  <span className="eyebrow">
                    {index === 0 ? "OPENING SEGMENT" : "THEN"} /{" "}
                    {item.type === "original" ? "ORIGINAL" : "STUDIO"}
                  </span>
                  <h3>{title}</h3>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) =>
                      patch(index, { enabled: e.target.checked })
                    }
                  />{" "}
                  Enabled
                </label>
              </div>
              <p className="event-segment-summary">
                {item.type === "original"
                  ? `${item.settings.rounds} rounds · ${item.settings.pace} pace`
                  : "Studio questions · current source pinned at launch"}
                {item.displayTitle ? ` · ${item.displayTitle}` : ""}
              </p>
              <details className="event-segment-options">
                <summary>Customize this segment</summary>
                <div className="event-fields">
                  <label>
                    Display title <span>(optional)</span>
                    <input
                      value={item.displayTitle}
                      maxLength={100}
                      onChange={(e) =>
                        patch(index, { displayTitle: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Transition label <span>(optional)</span>
                    <input
                      value={item.transitionLabel}
                      maxLength={100}
                      onChange={(e) =>
                        patch(index, { transitionLabel: e.target.value })
                      }
                    />
                  </label>
                  {item.type === "original" && (
                    <>
                      <PackChooser
                        game={item.gameSlug}
                        value={item.contentPackId}
                        onChange={(id) => patch(index, { contentPackId: id })}
                      />
                      <label>
                        Rounds
                        <select
                          value={item.settings.rounds}
                          onChange={(e) =>
                            patch(index, {
                              settings: {
                                ...item.settings,
                                rounds: Number(e.target.value),
                              },
                            })
                          }
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Pace
                        <select
                          value={item.settings.pace}
                          onChange={(e) =>
                            patch(index, {
                              settings: {
                                ...item.settings,
                                pace: e.target.value as "normal",
                              },
                            })
                          }
                        >
                          {["quick", "normal", "relaxed"].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Topic filter
                        <select
                          value={item.settings.pack}
                          onChange={(e) =>
                            patch(index, {
                              settings: {
                                ...item.settings,
                                pack: e.target.value,
                              },
                            })
                          }
                        >
                          {PACKS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {item.type === "studio_board" && (
                    <label>
                      Studio source
                      <select
                        value={item.boardId}
                        onChange={(e) =>
                          patch(index, { boardId: e.target.value })
                        }
                      >
                        {!boards.some((b) => b.id === item.boardId) && (
                          <option value={item.boardId}>
                            Current source · validate before launch
                          </option>
                        )}
                        {boards.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title || "Untitled board"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="event-wide">
                    Host note <span>(private; never sent to guests)</span>
                    <textarea
                      value={item.hostNote}
                      maxLength={500}
                      rows={2}
                      onChange={(e) =>
                        patch(index, { hostNote: e.target.value })
                      }
                    />
                  </label>
                </div>
              </details>
              <div className="event-actions">
                <button
                  className="button small outline"
                  disabled={index === 0}
                  aria-label={`Move ${title} up`}
                  onClick={() => {
                    const next = [...items];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    change(next);
                  }}
                >
                  ↑ Move up
                </button>
                <button
                  className="button small outline"
                  disabled={index === items.length - 1}
                  aria-label={`Move ${title} down`}
                  onClick={() => {
                    const next = [...items];
                    [next[index + 1], next[index]] = [
                      next[index],
                      next[index + 1],
                    ];
                    change(next);
                  }}
                >
                  ↓ Move down
                </button>
                <button
                  className="button small outline"
                  disabled={items.length >= 50}
                  onClick={() => {
                    const next = [...items];
                    next.splice(index + 1, 0, {
                      ...structuredClone(item),
                      itemId: crypto.randomUUID(),
                    });
                    change(next);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="button small outline"
                  onClick={() => change(items.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {!items.length && (
        <div className="event-empty">
          <h3>Every good event starts somewhere.</h3>
          <p>Pick an Original or a Studio board below to start your lineup.</p>
        </div>
      )}
      <div className="event-add">
        <label>
          Add an Original
          <select
            aria-label="Add an Original"
            value=""
            disabled={items.length >= 50}
            onChange={(e) => {
              if (e.target.value)
                change([
                  ...items,
                  {
                    ...common(),
                    type: "original",
                    gameSlug: e.target.value as (typeof GAMES)[number]["id"],
                    settings: { rounds: 3, pace: "normal", pack: "mixed" },
                  },
                ]);
            }}
          >
            <option value="">Choose a game…</option>
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Add a Studio board
          <select
            aria-label="Add a Studio board"
            value=""
            disabled={!boards.length || items.length >= 50}
            onChange={(e) => {
              if (e.target.value)
                change([
                  ...items,
                  {
                    ...common(),
                    type: "studio_board",
                    boardId: e.target.value,
                    settings: {},
                  },
                ]);
            }}
          >
            <option value="">
              {boards.length ? "Choose a board…" : "No Studio boards loaded"}
            </option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title || "Untitled board"}
              </option>
            ))}
          </select>
        </label>
        {moreBoards && (
          <button className="button outline small" onClick={loadBoards}>
            Load more Studio sources
          </button>
        )}
      </div>
      <p>
        Studio questions are pinned at launch. Changes made afterward stay in
        Studio.
      </p>
    </section>
  );
}
