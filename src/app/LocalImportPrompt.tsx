import { useWorkspace } from "../workspaces/WorkspaceContext";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import { useHostAuth } from "../auth/HostAuth";
import { LocalBoardRepository } from "../studio/LocalBoardRepository";
import { CloudBoardRepository } from "../studio/repository";
import { boardSchema } from "../../shared/boards";
import type { ImportResult } from "../../shared/cloud";
import { download } from "../studio/transfer";
const mappingKey = "ruckus-cloud-imports-v1";
export default function LocalImportPrompt() {
  const { user } = useHostAuth();
  const { items, current } = useWorkspace();
  const [destination, setDestination] = useState(
    () => items.find((w) => w.kind === "personal")!.id,
  );
  const mappingScope = `${user!.id}:${destination}`;
  const [initial] = useState(() => {
    try {
      const mapping: Record<string, Record<string, string>> = {};
      try {
        const parsed: unknown = JSON.parse(
          localStorage.getItem(mappingKey) || "{}",
        );
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [owner, entries] of Object.entries(parsed)) {
            if (
              entries &&
              typeof entries === "object" &&
              !Array.isArray(entries)
            )
              mapping[owner] = Object.fromEntries(
                Object.entries(entries).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              );
          }
        }
      } catch {
        /* Server import keys still prevent duplicates if this optional hint is unreadable. */
      }
      const candidates = new LocalBoardRepository().inspect();
      const personal = items.find((w) => w.kind === "personal")!;
      const personalHint =
        mapping[`${user!.id}:${personal.id}`] || mapping[user!.id] || {};
      const show = candidates.some(
        (item) =>
          !personalHint[item.key] ||
          (current.id !== personal.id &&
            current.permissions.includes("boards.create") &&
            !mapping[`${user!.id}:${current.id}`]?.[item.key]),
      );
      return { candidates, mapping, error: "", show };
    } catch (cause) {
      return {
        show: true,
        candidates: [],
        mapping: {} as Record<string, Record<string, string>>,
        error:
          cause instanceof Error
            ? cause.message
            : "Couldn’t read your local boards.",
      };
    }
  });
  const dismissalKey = `ruckus-import-dismissed:${user!.id}`;
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
      try {
        return sessionStorage.getItem(dismissalKey) === "true";
      } catch {
        return false;
      }
    }),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<ImportResult[]>([]);
  useEffect(() => setExpanded(false), [pathname]);
  if (
    (dismissed && !pathname.endsWith("/settings")) ||
    !initial.show ||
    (!initial.candidates.length && !initial.error)
  )
    return null;
  async function importBoards() {
    setBusy(true);
    const imported: ImportResult[] = [];
    const repository = new CloudBoardRepository(destination);
    for (const candidate of initial.candidates) {
      if (!candidate.board || !boardSchema.safeParse(candidate.board).success) {
        imported.push({
          key: candidate.key,
          code: "VALIDATION_ERROR",
          message:
            candidate.error || "This local board needs repair before import.",
        });
        continue;
      }
      try {
        // One board per request also keeps a large local library within the API body limit.
        const reply = await repository.import([
          { key: candidate.key, board: candidate.board },
        ]);
        imported.push(...reply.results);
        const committed = reply.results[0];
        if (committed?.id) {
          initial.mapping[mappingScope] = {
            ...initial.mapping[mappingScope],
            [candidate.key]: committed.id,
          };
          try {
            localStorage.setItem(mappingKey, JSON.stringify(initial.mapping));
          } catch {
            /* Server idempotency remains authoritative. */
          }
        }
      } catch (cause) {
        imported.push({
          key: candidate.key,
          code: "IMPORT_FAILED",
          message:
            cause instanceof Error
              ? cause.message
              : "Import didn’t finish. Retry safely.",
        });
      }
      setResults([...imported]);
    }
    setResults(imported);
    setBusy(false);
    window.dispatchEvent(new Event("ruckus:boards-imported"));
  }
  return (
    <section
      className="local-import-prompt"
      aria-labelledby="local-import-title"
    >
      <div className="local-import-summary">
        <span>
          {initial.error
            ? "Local board backup available"
            : `${initial.candidates.length} local board${initial.candidates.length === 1 ? "" : "s"} on this device`}
        </span>
        <button
          className="button small text-button"
          aria-expanded={expanded}
          aria-controls="local-import-details"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Close import options ↑" : "Review local boards →"}
        </button>
      </div>
      <div id="local-import-details" hidden={!expanded}>
        <div>
          <span className="eyebrow">YOUR WORK CAME WITH YOU</span>
          <h2 id="local-import-title">Bring your local boards along.</h2>
          <p>
            {initial.candidates.length
              ? `${initial.candidates.length} local board${initial.candidates.length === 1 ? "" : "s"} detected on this device. Choose a destination for ${user?.email}. The originals stay here.`
              : initial.error}
          </p>
        </div>
        <label>
          Import destination
          <select
            value={destination}
            disabled={busy}
            onChange={(e) => {
              setDestination(e.target.value);
              setResults([]);
            }}
          >
            {items
              .filter((w) => w.permissions.includes("boards.create"))
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.kind === "personal" ? " (personal)" : ""}
                </option>
              ))}
          </select>
        </label>
        <div className="hero-actions">
          {!!initial.candidates.length && (
            <button
              className="button small"
              disabled={busy}
              onClick={() => void importBoards()}
            >
              {busy
                ? "Importing…"
                : results.length
                  ? "Retry import safely"
                  : "Import local boards"}
            </button>
          )}
          <button
            className="button small outline"
            disabled={busy}
            onClick={() => {
              setDismissed(true);
              setExpanded(false);
              try {
                sessionStorage.setItem(dismissalKey, "true");
              } catch {
                /* Optional tab preference. */
              }
            }}
          >
            Not now
          </button>
          <button
            className="button small outline"
            onClick={() =>
              download(
                "ruckus-local-backup.json",
                localStorage.getItem("ruckus-studio-v1") || "[]",
                "application/json",
              )
            }
          >
            Export local backup
          </button>
        </div>
        {!!results.length && (
          <div className="local-import-results">
            <StatusBadge
              tone={results.some((result) => result.code) ? "error" : "saved"}
            >
              {`${results.filter((result) => result.id).length} saved to your account. ${results.filter((result) => result.code).length} need attention. Local originals are unchanged.`}
            </StatusBadge>
            <ul>
              {results.map((result) => (
                <li key={result.key}>
                  {initial.candidates.find((item) => item.key === result.key)
                    ?.board?.title || result.key}
                  : {result.id ? "Imported ✓" : result.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
