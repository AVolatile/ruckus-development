import { PageHeader } from "../app/PageHeader";
import { Icon } from "../components/Visuals";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { GAMES, gameById } from "../../shared/catalog";
import {
  CATEGORIES,
  SEASONS,
  DIFFICULTIES,
  emptyPack,
  packExportSchema,
  type PackRecord,
  type PackSummary,
} from "../../shared/content-packs";
import type { GameId } from "../../shared/types";
import { request } from "../lib/api";
import { Link, useNavigate } from "../workspaces/navigation";
import { useWorkspace } from "../workspaces/context";
import { PackItems } from "./PackItems";
import { downloadPack } from "./portable";
import "./content.css";
export default function PackPages({ create = false }: { create?: boolean }) {
  const { packId } = useParams(),
    { current, items: workspaces, can } = useWorkspace(),
    navigate = useNavigate(),
    [search, setSearch] = useSearchParams(),
    [rows, setRows] = useState<PackSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [record, setRecord] = useState<PackRecord>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [fetchFailed, setFetchFailed] = useState(false),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [game, setGame] = useState<GameId>("hotwire"),
    [target, setTarget] = useState(
      () =>
        workspaces.find(
          (w) =>
            w.id === current.id && w.permissions.includes("content.create"),
        )?.id ??
        workspaces.find((w) => w.permissions.includes("content.create"))?.id ??
        "",
    ),
    [query, setQuery] = useState(search.get("q") ?? "");
  const endpoint = `/api/v1/workspaces/${current.id}/content-packs`,
    filters = search.toString();
  useEffect(() => {
    if (create) return;
    let active = true;
    setLoading(true);
    setFetchFailed(false);
    setRecord(undefined);
    setError("");
    const job = packId
      ? request<PackRecord>(`${endpoint}/${packId}`).then((r) => {
          if (active) setRecord(r);
        })
      : request<{ items: PackSummary[]; nextCursor: string | null }>(
          `${endpoint}?${filters}`,
        ).then((r) => {
          if (active) {
            setRows(r.items);
            setCursor(r.nextCursor);
          }
        });
    void job
      .catch((e) => {
        if (active) {
          setError(e.message);
          setFetchFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, packId, filters, create, refresh]);
  const filter = (field: string, value: string) => {
    const next = new URLSearchParams(search);
    next.delete("cursor");
    if (value) next.set(field, value);
    else next.delete(field);
    setSearch(next);
  };
  const run = (job: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    void job()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const message = error && (
    <p role="alert" className="event-panel">
      {error}
    </p>
  );
  if (create)
    return (
      <section className="events-page content-page">
        <Link to="/app/content-packs">← Content Packs</Link>
        <PageHeader
          eyebrow="CONTENT PACKS / MADE FOR YOUR PEOPLE"
          title="A fresh set of possibilities."
        >
          <p>
            Choose the game, then write the prompts. Your pack stays private to
            this workspace.
          </p>
        </PageHeader>
        <form
          className="event-panel"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await request<PackRecord>(endpoint, {
                method: "POST",
                body: JSON.stringify({ document: emptyPack(game, name) }),
              });
              navigate(`/app/content-packs/${r.id}/edit`, {
                state: { hostNotice: "Private pack created. Make it yours." },
              });
            });
          }}
        >
          <div className="event-fields">
            <label>
              Pack name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!name.trim() && !!error}
              />
            </label>
            <label>
              Game
              <select
                value={game}
                onChange={(e) => setGame(e.target.value as GameId)}
              >
                {GAMES.map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {message}
          <button className="button" disabled={busy || !can("content.create")}>
            {busy ? "Creating…" : "Create private pack →"}
          </button>
        </form>
      </section>
    );
  if (packId) {
    if (loading) return <p role="status">Loading content pack…</p>;
    if (!record)
      return (
        <section className="page-hero">
          <h1>Pack unavailable.</h1>
          {message}
          <Link to="/app/content-packs">Back to packs</Link>
        </section>
      );
    const r = record,
      writable = r.workspaceId === current.id && can("content.update");
    return (
      <section className="events-page content-page">
        <Link to="/app/content-packs">← Content Packs</Link>
        <header
          className="pack-detail-intro"
          style={
            { "--pack-accent": gameById(r.gameType).color } as CSSProperties
          }
        >
          <div className="pack-detail-mark" aria-hidden="true">
            <Icon name={gameById(r.gameType).icon} />
            <span className="orbit-line" />
          </div>
          <div>
            <span className="eyebrow">
              {gameById(r.gameType).name} /{" "}
              {r.ownerType === "ruckus"
                ? "RUCKUS ORIGINAL CONTENT"
                : "PRIVATE WORKSPACE CONTENT"}
            </span>
            <h1>{r.name}</h1>
            <p>{r.document.shortDescription}</p>
            <p className="pack-detail-meta">
              {r.itemCount} items · {r.category.replaceAll("_", " ")} ·{" "}
              {r.season.replaceAll("_", " ")} · {r.difficulty} · {r.status} ·
              Revision {r.revisionNumber}
            </p>
          </div>
        </header>
        {message}
        <div className="event-panel">
          <p>{r.document.description}</p>
          <p>
            {r.provenance === "ruckus_original"
              ? "Original Ruckus content. Make a workspace copy to customize it."
              : r.provenance === "copied"
                ? "An independent copy, private to this workspace."
                : "Written for this workspace. Your pack stays private to its members."}
          </p>
          <div className="event-actions">
            {r.status === "ready" && can("boards.launch") && (
              <Link
                className="button"
                to={`/app/host?game=${r.gameType}&contentPackId=${r.id}`}
              >
                Play this pack →
              </Link>
            )}
            {r.status === "ready" && can("events.create") && (
              <Link
                className="button outline"
                to={`/app/events/new?game=${r.gameType}&contentPackId=${r.id}`}
              >
                Add to a new Event
              </Link>
            )}
            {writable && (
              <Link to={`/app/content-packs/${r.id}/edit`}>Edit pack</Link>
            )}
            <button onClick={() => downloadPack(r.document)}>
              Export JSON
            </button>
            {r.workspaceId === current.id && can("content.archive") && (
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Archive this pack? Existing live games keep their snapshot. New launches using it will need a replacement.",
                    )
                  )
                    run(async () => {
                      await request(`${endpoint}/${r.id}/archive`, {
                        method: "POST",
                        body: "{}",
                      });
                      navigate("/app/content-packs", {
                        state: {
                          hostNotice:
                            "Pack archived. Existing live games keep their snapshot.",
                        },
                      });
                    });
                }}
              >
                Archive pack
              </button>
            )}
          </div>
          <form
            className="pack-copy"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const copied = await request<PackRecord>(
                  `${endpoint}/${r.id}/copy`,
                  {
                    method: "POST",
                    body: JSON.stringify({ targetWorkspaceId: target }),
                  },
                );
                navigate(`/app/w/${target}/content-packs/${copied.id}`, {
                  state: {
                    hostNotice: "Editable copy saved to your workspace.",
                  },
                });
              });
            }}
          >
            <label>
              Copy into workspace
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {workspaces
                  .filter((w) => w.permissions.includes("content.create"))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              disabled={
                busy ||
                !workspaces.some(
                  (w) =>
                    w.id === target && w.permissions.includes("content.create"),
                )
              }
            >
              Create editable copy
            </button>
          </form>
        </div>
        <h2>Host preview</h2>
        <p>
          Sample of up to five items. Answer keys are visible here. This preview
          creates no live room.
        </p>
        <PackItems
          content={
            {
              ...r.document.content,
              items: r.document.content.items.slice(0, 5),
            } as typeof r.document.content
          }
        />
      </section>
    );
  }
  return (
    <section className="events-page content-page">
      <Link to="/app/library">← Library</Link>
      <header className="pack-shelf-intro">
        <div>
          <span className="eyebrow">SAME GREAT GAMES. FRESH MATERIAL.</span>
          <h1>Content Packs.</h1>
          <p>
            Originals set the rules. Packs bring the questions, scenes and
            creative sparks.
          </p>
        </div>
        {can("content.create") && (
          <Link className="button" to="/app/content-packs/new">
            Create private pack +
          </Link>
        )}
      </header>
      <form
        className="pack-filters"
        onSubmit={(e) => {
          e.preventDefault();
          filter("q", query);
        }}
      >
        <div className="event-fields">
          <label>
            Search packs
            <input
              maxLength={100}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button type="submit">Search</button>
          <label>
            Game
            <select
              value={search.get("game") ?? ""}
              onChange={(e) => filter("game", e.target.value)}
            >
              <option value="">All games</option>
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details
          className="pack-more-filters"
          open={
            ["category", "season", "difficulty", "source"].some((field) =>
              search.has(field),
            ) || undefined
          }
        >
          <summary>
            More filters <span>Category, season, difficulty & source</span>
          </summary>
          <div className="event-fields">
            {(
              [
                ["category", CATEGORIES],
                ["season", SEASONS],
                ["difficulty", DIFFICULTIES],
                ["source", ["ruckus", "workspace"]],
              ] as const
            ).map(([field, values]) => (
              <label key={field}>
                {field[0].toUpperCase() + field.slice(1)}
                <select
                  value={search.get(field) ?? ""}
                  onChange={(e) => filter(field, e.target.value)}
                >
                  <option value="">
                    All{" "}
                    {field === "source"
                      ? "sources"
                      : field === "category"
                        ? "categories"
                        : field === "difficulty"
                          ? "difficulties"
                          : "seasons"}
                  </option>
                  {values.map((v) => (
                    <option value={v} key={v}>
                      {v.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
        <button
          type="button"
          onClick={() => {
            setSearch({});
            setQuery("");
          }}
        >
          Clear filters
        </button>
      </form>
      {message}
      {loading ? (
        <p role="status">Loading packs…</p>
      ) : fetchFailed ? (
        <button
          className="button outline"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Try loading packs again
        </button>
      ) : (
        <>
          <p role="status">
            {rows.length} packs shown{cursor ? " · More available" : ""}
          </p>
          {!rows.length && (
            <div className="event-panel">
              <h2>No packs in this mix yet.</h2>
              <p>Clear a filter or create a pack for your workspace.</p>
            </div>
          )}
          <div className="pack-grid">
            {rows.map((r) => (
              <Link
                className="pack-card"
                key={r.id}
                to={`/app/content-packs/${r.id}`}
                style={
                  {
                    "--pack-accent": gameById(r.gameType).color,
                  } as CSSProperties
                }
              >
                <div className="pack-game-cover">
                  <div className="pack-cover-labels">
                    <span>{gameById(r.gameType).name}</span>
                    <span>
                      {r.ownerType === "ruckus" ? "Ruckus" : "Workspace"}
                    </span>
                  </div>
                  <div className="pack-game-art" aria-hidden="true">
                    <Icon name={gameById(r.gameType).icon} />
                    <span className="orbit-line" />
                  </div>
                </div>
                <h2>{r.name}</h2>
                <p>{r.shortDescription || "Private workspace content."}</p>
                <div className="pack-card-foot">
                  <span>
                    {r.itemCount} items · {r.status}
                  </span>
                  <span>
                    Explore pack <Icon name="arrow" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {cursor && (
            <button
              className="button outline"
              onClick={() =>
                run(async () => {
                  const r = await request<{
                    items: PackSummary[];
                    nextCursor: string | null;
                  }>(
                    `${endpoint}?${filters}&cursor=${encodeURIComponent(cursor)}`,
                  );
                  setRows((p) => [...p, ...r.items]);
                  setCursor(r.nextCursor);
                })
              }
              disabled={busy}
            >
              Load more packs
            </button>
          )}
        </>
      )}
      {can("content.create") && (
        <div className="event-panel">
          <h2>Bring a pack with you.</h2>
          <p>
            Import a Ruckus Content Pack JSON export into {current.name}. This
            creates a new private pack and revision 1.
          </p>
          <label>
            Import pack JSON
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                run(async () => {
                  if (file.size > 320000)
                    throw new Error("Use a JSON file smaller than 320 KB.");
                  const data = packExportSchema.parse(
                    JSON.parse(await file.text()),
                  );
                  const r = await request<PackRecord>(`${endpoint}/import`, {
                    method: "POST",
                    body: JSON.stringify(data),
                  });
                  navigate(`/app/content-packs/${r.id}`, {
                    state: {
                      hostNotice: "Pack imported and saved to your workspace.",
                    },
                  });
                });
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}
