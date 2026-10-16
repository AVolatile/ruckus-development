import type { PackContent } from "../../shared/content-packs";
export function PackItems({
  content,
  onChange,
}: {
  content: PackContent;
  onChange?: (c: PackContent) => void;
}) {
  const change = (n: number, patch: Record<string, unknown>) =>
    onChange?.({
      ...content,
      items: content.items.map((item, i) =>
        i === n ? { ...item, ...patch } : item,
      ),
    } as PackContent);
  const edit = !!onChange;
  return (
    <div className="pack-items">
      {content.items.map((item, n) => (
        <article className="event-panel pack-item" key={item.id}>
          <h3>Item {n + 1}</h3>
          {edit ? (
            <label>
              Prompt
              <textarea
                maxLength={500}
                value={item.title}
                onChange={(e) => change(n, { title: e.target.value })}
              />
            </label>
          ) : (
            <h4>{item.title}</h4>
          )}
          {"scene" in item && (
            <>
              {edit ? (
                <label>
                  Scene
                  <select
                    value={item.scene}
                    onChange={(e) =>
                      change(n, { scene: Number(e.target.value) })
                    }
                  >
                    {Array.from({ length: 15 }, (_, i) => (
                      <option key={i} value={i}>
                        Ruckus scene {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <img
                className="pack-scene"
                src={`/scenes/${item.scene}.svg`}
                alt={`Illustration for item ${n + 1}`}
              />
            </>
          )}
          {"options" in item && (
            <div className="event-fields">
              {item.options.map((choice, i) => (
                <label key={i}>
                  Choice {i + 1}
                  {edit ? (
                    <input
                      maxLength={200}
                      value={choice}
                      onChange={(e) =>
                        change(n, {
                          options: item.options.map((s, j) =>
                            i === j ? e.target.value : s,
                          ),
                        })
                      }
                    />
                  ) : (
                    <span>
                      {choice}
                      {"answer" in item && item.answer === i
                        ? " ✓ Correct answer"
                        : ""}
                    </span>
                  )}
                </label>
              ))}
              {"answer" in item && edit && (
                <label>
                  Correct answer
                  <select
                    value={item.answer}
                    onChange={(e) =>
                      change(n, { answer: Number(e.target.value) })
                    }
                  >
                    {item.options.map((_, i) => (
                      <option key={i} value={i}>
                        Choice {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {edit && (
                <div className="event-actions">
                  <button
                    type="button"
                    disabled={item.options.length >= 6}
                    onClick={() =>
                      change(n, { options: [...item.options, ""] })
                    }
                  >
                    Add choice
                  </button>
                  <button
                    type="button"
                    disabled={item.options.length <= 2}
                    onClick={() =>
                      change(n, {
                        options: item.options.slice(0, -1),
                        ...("answer" in item
                          ? {
                              answer: Math.min(
                                item.answer,
                                item.options.length - 2,
                              ),
                            }
                          : {}),
                      })
                    }
                  >
                    Remove last choice
                  </button>
                </div>
              )}
            </div>
          )}
          {"explanation" in item ||
          content.gameType === "hotwire" ||
          content.gameType === "odd-one-in" ? (
            <label>
              Explanation{" "}
              {edit ? (
                <textarea
                  maxLength={1000}
                  value={"explanation" in item ? (item.explanation ?? "") : ""}
                  onChange={(e) => change(n, { explanation: e.target.value })}
                />
              ) : (
                <span>{"explanation" in item ? item.explanation : ""}</span>
              )}
            </label>
          ) : null}
          {edit && (
            <>
              <label>
                Legacy topic / item tag (optional)
                <input
                  maxLength={80}
                  value={item.pack ?? ""}
                  onChange={(e) => change(n, { pack: e.target.value })}
                />
              </label>
              <div className="event-actions">
                <button
                  type="button"
                  disabled={n === 0}
                  aria-label={`Move item ${n + 1} up`}
                  onClick={() => {
                    const items = [...content.items];
                    [items[n - 1], items[n]] = [items[n], items[n - 1]];
                    onChange({ ...content, items } as PackContent);
                  }}
                >
                  ↑ Up
                </button>
                <button
                  type="button"
                  disabled={n === content.items.length - 1}
                  aria-label={`Move item ${n + 1} down`}
                  onClick={() => {
                    const items = [...content.items];
                    [items[n + 1], items[n]] = [items[n], items[n + 1]];
                    onChange({ ...content, items } as PackContent);
                  }}
                >
                  ↓ Down
                </button>
                <button
                  type="button"
                  disabled={content.items.length >= 500}
                  onClick={() =>
                    onChange({
                      ...content,
                      items: [
                        ...content.items.slice(0, n + 1),
                        { ...structuredClone(item), id: crypto.randomUUID() },
                        ...content.items.slice(n + 1),
                      ],
                    } as PackContent)
                  }
                >
                  Duplicate item
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...content,
                      items: content.items.filter((_, i) => i !== n),
                    } as PackContent)
                  }
                >
                  Delete item
                </button>
              </div>
            </>
          )}
        </article>
      ))}
      {!content.items.length && (
        <p>
          Add your first prompt. A pack needs at least one complete item before
          it is ready to play.
        </p>
      )}
      {edit && (
        <button
          type="button"
          className="button outline"
          disabled={content.items.length >= 500}
          onClick={() => {
            const common = { id: crypto.randomUUID(), title: "" };
            const next =
              content.gameType === "hotwire" ||
              content.gameType === "odd-one-in"
                ? {
                    ...common,
                    options: ["", "", "", ""],
                    answer: 0,
                    explanation: "",
                  }
                : content.gameType === "room-temperature"
                  ? { ...common, options: ["", "", "", ""] }
                  : content.gameType === "caption-this"
                    ? { ...common, scene: 0 }
                    : common;
            onChange({
              ...content,
              items: [...content.items, next],
            } as PackContent);
          }}
        >
          Add item +
        </button>
      )}
    </div>
  );
}
