import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { BrandRecord, BrandSnapshot } from "../../shared/brand";
import type { BoardPage } from "../../shared/cloud";
import type { EventRecord } from "../../shared/events";
import type { Reply } from "../../shared/types";
import { useWorkspace } from "../workspaces/context";
import { Link, useNavigate } from "../workspaces/navigation";
import { request } from "../lib/api";
import { useParty } from "../lib/party";
import { PlaylistEditor } from "./PlaylistEditor";
import { useEventDraft, exportEvent } from "./useEventDraft";
import BrandPreview from "../brand/BrandPreview";
import { GAMES } from "../../shared/catalog";
interface Validation {
  issues: { itemId?: string; message: string }[];
  warnings: string[];
  brand: BrandSnapshot | null;
  segments: { itemId: string; title: string; boardId?: string }[];
}
export default function EventBuilder({
  preview = false,
}: {
  preview?: boolean;
}) {
  const { eventId } = useParams(),
    { current, can, items: workspaces } = useWorkspace(),
    navigate = useNavigate(),
    party = useParty();
  const draft = useEventDraft(current.id, eventId);
  const { setError } = draft;
  const [boards, setBoards] = useState<BoardPage>({
      items: [],
      nextCursor: null,
    }),
    [brands, setBrands] = useState<BrandRecord[]>([]),
    [brandOffset, setBrandOffset] = useState<number | null>(null),
    [validation, setValidation] = useState<Validation>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false),
    [target, setTarget] = useState(current.id);
  const base = `/api/v1/workspaces/${current.id}`,
    endpoint = `${base}/events/${eventId}`,
    d = draft.definition;
  useEffect(() => {
    let active = true;
    void Promise.all([
      request<BoardPage>(`${base}/boards`),
      request<{ items: BrandRecord[]; nextOffset: number | null }>(
        `${base}/brand-kits`,
      ),
    ])
      .then(([b, k]) => {
        if (active) {
          setBoards(b);
          setBrands(k.items);
          setBrandOffset(k.nextOffset);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base, setError]);
  useEffect(() => {
    if (!preview || !d) return;
    let active = true;
    void request<Validation>(`${base}/events/validate`, {
      method: "POST",
      body: JSON.stringify({ definition: d }),
    })
      .then((r) => {
        if (active) setValidation(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [preview, d, base, setError]);
  async function run(job: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await job();
    } catch (e) {
      draft.setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!d) return;
    const r = await request<Validation>(`${base}/events/validate`, {
      method: "POST",
      body: JSON.stringify({ definition: d }),
    });
    setValidation(r);
    return r;
  }
  async function launch() {
    await run(async () => {
      const saved = await draft.flush();
      const v = await check();
      if (v?.issues.length) {
        setNotice("Repair the listed issues before launching.");
        return;
      }
      const reply = await request<Reply>(endpoint + "/launch", {
        method: "POST",
        body: JSON.stringify({ baseRevisionId: saved.revisionId }),
      });
      if (!reply.identity)
        throw new Error("The event did not return a stage. Try again shortly.");
      const resumed = await party.resume(reply.identity);
      if (!resumed.ok) throw new Error(resumed.error);
      navigate(`/room/${reply.identity.code}/host`);
    });
  }
  if (draft.loading)
    return (
      <section className="page-hero">
        <p role="status">Opening your event…</p>
      </section>
    );
  if (!d)
    return (
      <section className="page-hero">
        <h1>That event isn’t available.</h1>
        <p role="alert">{draft.error}</p>
        <Link to="/app/events" className="button">
          Back to events
        </Link>
      </section>
    );
  const edit = can("events.update") && !preview;
  const settingLabels = {
    showEventIntro: "Show event introduction",
    showIntermissionBetweenGames: "Pause between games",
    showFinalEventLeaderboard: "Show final event leaderboard",
    carryScoresAcrossGames: "Carry event placement points across games",
    allowLateJoin: "Allow guests to join after the event starts",
  };
  return (
    <section className="events-page">
      <div className="event-editor-header">
        <div>
          <Link to="/app/events" className="text-link">
            ← Workspace events
          </Link>
          <span className="eyebrow">
            {preview ? "EVENT PREVIEW · NO LIVE ROOM" : "EXPERIENCE BUILDER"}
          </span>
          <h1>{d.title}</h1>
          <p role="status" aria-live="polite">
            {draft.status}
          </p>
        </div>
        <div className="event-actions">
          {edit && (
            <button
              className="button outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await draft.flush();
                  navigate(`/app/events/${eventId}/preview`);
                })
              }
            >
              Preview ↗
            </button>
          )}
          {preview && can("events.update") && (
            <Link className="button outline" to={`/app/events/${eventId}`}>
              Edit event
            </Link>
          )}
          {can("events.launch") && (
            <button
              className="button"
              disabled={busy || !!draft.error}
              onClick={() => void launch()}
            >
              {busy ? "Preparing…" : "Launch event ↗"}
            </button>
          )}
        </div>
      </div>
      {draft.error && (
        <div className="event-feedback" role="alert">
          <p>{draft.error}</p>
          <div className="event-actions">
            <button
              className="button small outline"
              onClick={() => exportEvent(d)}
            >
              Export my edits
            </button>
            {!draft.conflict && (
              <button
                className="button small outline"
                onClick={() => void draft.retry()}
              >
                Retry save
              </button>
            )}
            <button
              className="button small outline"
              onClick={() => {
                if (
                  !draft.dirty ||
                  window.confirm(
                    "Replace your unsaved edits with the latest cloud event? Export first to keep a copy.",
                  )
                )
                  void draft.reload().catch((e) => draft.setError(e.message));
              }}
            >
              Load latest cloud event
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {validation && (
        <section className="event-validation" aria-label="Event readiness">
          <h2>
            {validation.issues.length
              ? "A few things to fix."
              : "Ready for the room."}
          </h2>
          <ul>
            {validation.issues.map((issue, i) => (
              <li key={i}>
                {issue.itemId
                  ? `Segment ${d.playlist.findIndex((p) => p.itemId === issue.itemId) + 1}: `
                  : ""}
                {issue.message}
              </li>
            ))}
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      {edit ? (
        <fieldset className="event-edit-fields" disabled={busy}>
          <legend className="sr-only">Event configuration</legend>
          <section className="event-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">SET THE SCENE</span>
                <h2>Give it a name.</h2>
              </div>
            </div>
            <div className="event-fields">
              <label>
                Event title
                <input
                  required
                  value={d.title}
                  maxLength={100}
                  aria-invalid={!d.title.trim()}
                  onChange={(e) =>
                    draft.update({ ...d, title: e.target.value })
                  }
                />
                {!d.title.trim() && (
                  <span role="alert">Give your event a title.</span>
                )}
              </label>
              <label>
                Subtitle <span>(optional)</span>
                <input
                  value={d.subtitle ?? ""}
                  maxLength={160}
                  onChange={(e) =>
                    draft.update({ ...d, subtitle: e.target.value || null })
                  }
                />
              </label>
              <label className="event-wide">
                Description <span>(private planning notes)</span>
                <textarea
                  value={d.description ?? ""}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) =>
                    draft.update({ ...d, description: e.target.value || null })
                  }
                />
              </label>
              <label>
                Brand Kit
                <select
                  value={d.brandKitId ?? ""}
                  onChange={(e) =>
                    draft.update({ ...d, brandKitId: e.target.value || null })
                  }
                >
                  <option value="">Ruckus original styling</option>
                  {d.brandKitId &&
                    !brands.some((b) => b.id === d.brandKitId) && (
                      <option value={d.brandKitId}>
                        Selected kit · validate availability
                      </option>
                    )}
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.isDefault ? " · workspace default" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {brandOffset !== null && (
                <button
                  className="button small outline"
                  onClick={() => {
                    void request<{
                      items: BrandRecord[];
                      nextOffset: number | null;
                    }>(`${base}/brand-kits?offset=${brandOffset}`)
                      .then((r) => {
                        setBrands((old) => [...old, ...r.items]);
                        setBrandOffset(r.nextOffset);
                      })
                      .catch((e) => draft.setError(e.message));
                  }}
                >
                  Load more Brand Kits
                </button>
              )}
            </div>
            <p>
              Branding shapes the event stage. Launch freezes its current
              revision and the images it uses.
            </p>
            <Link to="/app/brand">Manage Brand Kits ↗</Link>
          </section>
          <PlaylistEditor
            definition={d}
            update={draft.update}
            boards={boards.items}
            moreBoards={!!boards.nextCursor}
            loadBoards={() => {
              void request<BoardPage>(
                `${base}/boards?cursor=${encodeURIComponent(boards.nextCursor!)}`,
              )
                .then((r) =>
                  setBoards((old) => ({
                    items: [...old.items, ...r.items],
                    nextCursor: r.nextCursor,
                  })),
                )
                .catch((e) => draft.setError(e.message));
            }}
          />
          <section className="event-panel">
            <h2>How the room runs.</h2>
            <div className="event-checks">
              {Object.entries(settingLabels).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={d.eventSettings[key as keyof typeof settingLabels]}
                    onChange={(e) =>
                      draft.update({
                        ...d,
                        eventSettings: {
                          ...d.eventSettings,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p>
              Hosts control every game boundary. Game timers still run the
              rounds. Tied placements receive the same event points; each scored
              segment awards 0–1,000 points. Guests joining late start at zero.
            </p>
            <p>Powered by Ruckus stays visible throughout.</p>
            <div className="event-fields">
              {(
                [
                  ["introMessage", "Introduction"],
                  ["intermissionMessage", "Intermission"],
                  ["finalMessage", "Closing message"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    maxLength={240}
                    rows={2}
                    value={d.presentationSettings[key]}
                    onChange={(e) =>
                      draft.update({
                        ...d,
                        presentationSettings: {
                          ...d.presentationSettings,
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      ) : (
        <>
          <section className="event-panel event-preview-copy">
            <span className="eyebrow">INTRODUCTION</span>
            <h2>{d.title}</h2>
            {d.subtitle && <p>{d.subtitle}</p>}
            <p>{d.presentationSettings.introMessage}</p>
            <ol className="event-preview-lineup">
              {d.playlist
                .filter((p) => p.enabled)
                .map((p, i) => (
                  <li key={p.itemId}>
                    <span className="event-number">{i + 1}</span>
                    <div>
                      <h3>
                        {p.displayTitle ||
                          validation?.segments.find(
                            (s) => s.itemId === p.itemId,
                          )?.title ||
                          (p.type === "original"
                            ? GAMES.find((g) => g.id === p.gameSlug)?.name
                            : "Studio board")}
                      </h3>
                      <p>
                        {p.transitionLabel ||
                          "The host introduces the next game."}
                      </p>
                      {p.type === "studio_board" && (
                        <Link to={`/app/studio/boards/${p.boardId}/preview`}>
                          Preview the Studio board ↗
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
            </ol>
            <span className="eyebrow">INTERMISSION</span>
            <p>
              {d.eventSettings.showIntermissionBetweenGames
                ? d.presentationSettings.intermissionMessage
                : "The host moves straight to the next introduction."}
            </p>
            <span className="eyebrow">EVENT FINALE</span>
            <p>{d.presentationSettings.finalMessage}</p>
            <p>
              {d.eventSettings.carryScoresAcrossGames &&
              d.eventSettings.showFinalEventLeaderboard
                ? "Cumulative placement points bring the whole event together."
                : "The event closes with a shared thank-you."}
            </p>
          </section>
          {validation?.brand && (
            <BrandPreview
              config={validation.brand.config}
              workspaceId={current.id}
            />
          )}
        </>
      )}
      <section className="event-panel">
        <div className="event-actions">
          {edit && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await draft.flush();
                  setNotice("Event saved to workspace.");
                })
              }
            >
              Save event
            </button>
          )}
          <button
            className="button outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await check();
              })
            }
          >
            Check launch readiness
          </button>
          <button className="button outline" onClick={() => exportEvent(d)}>
            Export definition
          </button>
        </div>
        {workspaces.some((w) => w.permissions.includes("events.create")) && (
          <div className="event-copy">
            <label>
              Copy destination
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {workspaces
                  .filter((w) => w.permissions.includes("events.create"))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (edit) await draft.flush();
                  const result = await request<EventRecord>(
                    endpoint + "/copy",
                    {
                      method: "POST",
                      body: JSON.stringify({ targetWorkspaceId: target }),
                    },
                  );
                  navigate(`/app/w/${target}/events/${result.id}`);
                })
              }
            >
              Create editable copy
            </button>
            <p>
              Copies to another workspace include fresh Studio sources and use
              Ruckus styling.
            </p>
          </div>
        )}
        {can("events.archive") && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Archive event
          </button>
        )}
        {confirm && (
          <div className="event-feedback">
            <h3>Archive this event?</h3>
            <p>
              It will leave this list and cannot launch again. Existing launches
              and revision history remain intact.
            </p>
            <button
              className="button danger"
              onClick={() =>
                void run(async () => {
                  await draft.flush();
                  await request(endpoint + "/archive", {
                    method: "POST",
                    body: "{}",
                  });
                  navigate("/app/events");
                })
              }
            >
              Confirm archive
            </button>{" "}
            <button
              className="button outline"
              onClick={() => setConfirm(false)}
            >
              Keep event
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
