import { useState } from "react";
import { useHostAuth } from "../auth/HostAuth";
import { LocalBoardRepository } from "../studio/LocalBoardRepository";
import { CloudBoardRepository } from "../studio/repository";
import { boardSchema } from "../../shared/boards";
import type { ImportResult } from "../../shared/cloud";
import { download } from "../studio/transfer";
const mappingKey = "ruckus-cloud-imports-v1";
export default function LocalImportPrompt() {
  const { user } = useHostAuth();
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
      const candidates = new LocalBoardRepository()
        .inspect()
        .filter((item) => !mapping[user!.id]?.[item.key]);
      return { candidates, mapping, error: "" };
    } catch (cause) {
      return {
        candidates: [],
        mapping: {} as Record<string, Record<string, string>>,
        error:
          cause instanceof Error
            ? cause.message
            : "Couldn’t read your local boards.",
      };
    }
  });
  const [dismissed, setDismissed] = useState(false),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<ImportResult[]>([]);
  if (dismissed || (!initial.candidates.length && !initial.error)) return null;
  async function importBoards() {
    setBusy(true);
    const imported: ImportResult[] = [];
    const repository = new CloudBoardRepository();
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
          initial.mapping[user!.id] = {
            ...initial.mapping[user!.id],
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
      <div>
        <span className="eyebrow">YOUR WORK CAME WITH YOU</span>
        <h2 id="local-import-title">Bring your local boards along.</h2>
        <p>
          {initial.candidates.length
            ? `${initial.candidates.length} local board${initial.candidates.length === 1 ? "" : "s"} detected on this device. Choose to copy them into ${user?.email}. The originals stay here.`
            : initial.error}
        </p>
      </div>
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
          onClick={() => setDismissed(true)}
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
        <div role="status">
          <p>
            {results.filter((result) => result.id).length} saved to your
            account. {results.filter((result) => result.code).length} need
            attention. Local originals are unchanged.
          </p>
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
    </section>
  );
}
