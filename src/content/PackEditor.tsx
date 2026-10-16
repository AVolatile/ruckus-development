import { downloadPack } from "./portable";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { useWorkspace } from "../workspaces/context";
import { Link } from "../workspaces/navigation";
import { useRevisionDraft } from "../lib/useRevisionDraft";
import {
  packDocumentSchema,
  packIssues,
  type PackDocument,
  type PackRecord,
  CATEGORIES,
  SEASONS,
  DIFFICULTIES,
} from "../../shared/content-packs";
import { PackItems } from "./PackItems";
import "./content.css";
const options = {
  field: "document" as const,
  resource: "content-packs",
  schema: packDocumentSchema,
  conflictCode: "CONTENT_CONFLICT",
  label: "content pack",
};
export default function PackEditor() {
  const { packId } = useParams(),
    { current, can } = useWorkspace(),
    draft = useRevisionDraft<PackDocument, "document", PackRecord>(
      current.id,
      packId,
      options,
    ),
    [busy, setBusy] = useState(false);
  if (draft.loading) return <p role="status">Loading content pack…</p>;
  const d = draft.definition;
  if (!d)
    return (
      <section className="page-hero">
        <h1>Pack unavailable.</h1>
        <p role="alert">{draft.error}</p>
        <Link to="/app/content-packs">Back to packs</Link>
      </section>
    );
  if (
    draft.record?.ownerType !== "workspace" ||
    draft.record.workspaceId !== current.id
  )
    return (
      <section className="page-hero">
        <h1>Make it your own.</h1>
        <p>
          Ruckus packs are read-only. Create an editable workspace copy from the
          pack details.
        </p>
        <Link to={`/app/content-packs/${packId}`}>Pack details →</Link>
      </section>
    );
  const errors = packDocumentSchema.safeParse(d),
    issues = packIssues(d),
    patch = (p: Partial<PackDocument>) => draft.update({ ...d, ...p });
  return (
    <section className="events-page content-page">
      <Link to={`/app/content-packs/${packId}`}>← Pack details</Link>
      <header className="page-hero">
        <span className="eyebrow">
          WORKSPACE CONTENT / {d.content.gameType}
        </span>
        <h1>{d.name || "Your next pack"}</h1>
        <p>Write for your room. Revisions preserve every acknowledged save.</p>
      </header>
      <div className="event-panel">
        <p role="status">
          {draft.status}
          {draft.revisionNumber ? ` · Revision ${draft.revisionNumber}` : ""}
        </p>
        {draft.error && <p role="alert">{draft.error}</p>}
        {!errors.success && (
          <ul role="alert">
            {errors.error.issues.map((e, n) => (
              <li key={n}>
                {e.path.join(" → ")}: {e.message}
              </li>
            ))}
          </ul>
        )}
        <div className="event-actions">
          <button
            type="button"
            className="button"
            disabled={
              busy ||
              !can("content.update") ||
              !errors.success ||
              draft.conflict
            }
            onClick={() => {
              setBusy(true);
              void draft.retry().finally(() => setBusy(false));
            }}
          >
            Save now
          </button>
          <button type="button" onClick={() => downloadPack(d)}>
            Export edits
          </button>
          {draft.error && !draft.conflict && (
            <button type="button" onClick={() => void draft.retry()}>
              Retry save
            </button>
          )}
          {draft.conflict && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Replace your edits with the latest saved pack? Export first to keep a copy.",
                  )
                )
                  void draft.reload();
              }}
            >
              Load latest
            </button>
          )}
        </div>
      </div>
      <fieldset
        disabled={!can("content.update")}
        className="event-panel pack-metadata"
      >
        <legend>Pack details</legend>
        <div className="event-fields">
          <label>
            Name
            <input
              maxLength={100}
              value={d.name}
              aria-invalid={!d.name.trim()}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            Short description
            <input
              maxLength={240}
              value={d.shortDescription}
              onChange={(e) => patch({ shortDescription: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={2000}
              value={d.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          {(
            [
              ["category", CATEGORIES],
              ["season", SEASONS],
              ["difficulty", DIFFICULTIES],
            ] as const
          ).map(([field, values]) => (
            <label key={field}>
              {field[0].toUpperCase() + field.slice(1)}
              <select
                value={d[field]}
                onChange={(e) => patch({ [field]: e.target.value })}
              >
                {values.map((v) => (
                  <option key={v} value={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Search tags (comma separated)
            <input
              maxLength={490}
              value={d.tags.join(", ")}
              onChange={(e) =>
                patch({
                  tags: e.target.value
                    ? e.target.value.split(",").map((s) => s.trim())
                    : [],
                })
              }
            />
          </label>
          <label>
            Availability
            <select
              value={d.status}
              onChange={(e) =>
                patch({ status: e.target.value as "draft" | "ready" })
              }
            >
              <option value="draft">Draft</option>
              <option value="ready" disabled={issues.length > 0}>
                Ready to play
              </option>
            </select>
          </label>
        </div>
        {issues.length > 0 && (
          <div>
            <p>Before this pack is ready:</p>
            <ul>
              {issues.slice(0, 20).map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ul>
            {issues.length > 20 && (
              <p>{issues.length - 20} more incomplete items.</p>
            )}
          </div>
        )}
      </fieldset>
      <PackItems
        content={d.content}
        onChange={
          can("content.update") ? (content) => patch({ content }) : undefined
        }
      />
    </section>
  );
}
