import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useNavigate } from "../workspaces/navigation";
import { boardSchema, newBoard, type CustomBoard } from "../../shared/boards";
import type { BoardRecord } from "../../shared/cloud";
import { ApiClientError } from "../lib/api";
import { useHostAuth } from "../auth/HostAuth";
import { useBoardRepository } from "./RepositoryProvider";
const signature = (board: CustomBoard) =>
  JSON.stringify({ ...board, id: "", createdAt: "", updatedAt: "" });
export function useCloudDraft(id?: string) {
  const repository = useBoardRepository(),
    navigate = useNavigate();
  const { user } = useHostAuth();
  const ownerId = user?.id;
  const recoveryKey = useCallback(
    (boardId: string) =>
      `ruckus-unsaved-v1:${ownerId}:${repository.workspaceId || "personal"}:${boardId}`,
    [ownerId, repository.workspaceId],
  );
  const [board, updateBoard] = useState<CustomBoard>(),
    [loading, setLoading] = useState(true),
    [saved, setSaved] = useState("Loading board…"),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const latest = useRef<CustomBoard>(undefined),
    record = useRef<BoardRecord>(undefined),
    acknowledged = useRef(""),
    pending = useRef<Promise<BoardRecord>>(undefined),
    blocked = useRef(false),
    mounted = useRef(true),
    draft = useRef<CustomBoard>(undefined);
  if (!draft.current) draft.current = newBoard();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (id && record.current?.board.id === id) return;
    let active = true;
    setLoading(true);
    setError("");
    blocked.current = false;
    const load =
      !id || id === "new"
        ? repository.create(draft.current!, `draft:${draft.current!.id}`)
        : repository.get(id);
    void load
      .then((value) => {
        if (!active) return;
        record.current = value;
        latest.current = value?.board;
        acknowledged.current = value ? signature(value.board) : "";
        if (value) {
          try {
            const raw =
              sessionStorage.getItem(recoveryKey(value.board.id)) ||
              sessionStorage.getItem(
                `ruckus-unsaved-v1:${ownerId}:${value.board.id}`,
              );
            if (raw) {
              const recovery = JSON.parse(raw),
                recovered = boardSchema.parse(recovery.board);
              if (recovered.id === value.board.id) {
                if (signature(recovered) !== acknowledged.current)
                  sessionStorage.setItem(recoveryKey(value.board.id), raw);
                else sessionStorage.removeItem(recoveryKey(value.board.id));
                sessionStorage.removeItem(
                  `ruckus-unsaved-v1:${ownerId}:${value.board.id}`,
                );
              }
              if (
                recovered.id === value.board.id &&
                signature(recovered) !== acknowledged.current
              ) {
                latest.current = recovered;
                if (recovery.baseRevisionId !== value.revisionId) {
                  blocked.current = true;
                  setConflict(true);
                  setError(
                    "Recovered edits are based on an older version. Export them before loading the latest board.",
                  );
                }
              }
            }
          } catch {
            /* An unreadable optional cache never replaces the server board. */
          }
        }
        updateBoard(latest.current);
        setSaved(
          blocked.current
            ? "Conflict detected"
            : value &&
                latest.current &&
                signature(latest.current) !== acknowledged.current
              ? "Unsaved changes"
              : value
                ? "Saved to workspace"
                : "Board unavailable",
        );
        setLoading(false);
        if (value && (!id || id === "new"))
          navigate(`/app/studio/boards/${value.board.id}`, { replace: true });
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn’t load your board.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, repository, navigate, recoveryKey, ownerId]);
  const setBoard = useCallback(
    (value: SetStateAction<CustomBoard | undefined>) => {
      const next = typeof value === "function" ? value(latest.current) : value;
      latest.current = next;
      updateBoard(next);
      if (next) {
        try {
          sessionStorage.setItem(
            recoveryKey(next.id),
            JSON.stringify({
              board: next,
              baseRevisionId: record.current?.revisionId,
            }),
          );
        } catch {
          /* Optional crash recovery; cloud acknowledgement remains authoritative. */
        }
      }
      if (next && !blocked.current)
        setSaved(
          signature(next) === acknowledged.current && !pending.current
            ? "Saved to workspace"
            : pending.current
              ? "Saving…"
              : "Unsaved changes",
        );
    },
    [recoveryKey],
  );
  const flush = useCallback(async (): Promise<BoardRecord> => {
    if (blocked.current)
      throw new Error(
        "Resolve the save issue before continuing. Export your edits to keep a copy.",
      );
    if (pending.current) {
      await pending.current;
      return flush();
    }
    if (!latest.current || !record.current)
      throw new Error("Wait for this board to finish loading.");
    const job = async () => {
      while (
        latest.current &&
        signature(latest.current) !== acknowledged.current
      ) {
        const snapshot = structuredClone(latest.current);
        if (mounted.current) setSaved("Saving…");
        const value = await repository.save(
          snapshot,
          record.current!.revisionId,
        );
        record.current = value;
        acknowledged.current = signature(snapshot);
        // Keep edits made while this request was running; only server-owned metadata changes.
        latest.current = {
          ...latest.current!,
          id: value.board.id,
          createdAt: value.board.createdAt,
          updatedAt: value.board.updatedAt,
        };
        try {
          if (signature(latest.current) === acknowledged.current)
            sessionStorage.removeItem(recoveryKey(value.board.id));
          else
            sessionStorage.setItem(
              recoveryKey(value.board.id),
              JSON.stringify({
                board: latest.current,
                baseRevisionId: value.revisionId,
              }),
            );
        } catch {
          /* Cloud state is authoritative. */
        }
        if (mounted.current) updateBoard(latest.current);
      }
      if (mounted.current) {
        setSaved("Saved to workspace");
        setError("");
      }
      return record.current!;
    };
    pending.current = job();
    try {
      return await pending.current;
    } catch (cause) {
      blocked.current = true;
      if (mounted.current) {
        const stale =
          cause instanceof ApiClientError && cause.code === "BOARD_CONFLICT";
        setConflict(stale);
        setSaved(stale ? "Conflict detected" : "Save failed");
        setError(
          cause instanceof Error
            ? cause.message
            : "Your edits haven’t been saved. Export a copy or retry.",
        );
      }
      throw cause;
    } finally {
      pending.current = undefined;
    }
  }, [repository, recoveryKey]);
  useEffect(() => {
    if (!board || blocked.current || signature(board) === acknowledged.current)
      return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 750);
    return () => clearTimeout(timer);
  }, [board, flush]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        latest.current &&
        signature(latest.current) !== acknowledged.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !latest.current ||
        signature(latest.current) === acknowledged.current
      )
        return;
      const anchor = (event.target as Element).closest?.("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        (url.hash && url.pathname === window.location.pathname)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void flush()
        .then(() => navigate(url.pathname + url.search + url.hash))
        .catch(() => {});
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [flush, navigate]);
  async function retry() {
    blocked.current = false;
    setError("");
    try {
      await flush();
    } catch {
      /* Save state contains the precise failure. */
    }
  }
  async function reloadLatest() {
    if (!record.current) return;
    try {
      const value = await repository.get(record.current.board.id);
      if (!value) throw new Error("That board is no longer available.");
      record.current = value;
      acknowledged.current = signature(value.board);
      latest.current = value.board;
      updateBoard(value.board);
      blocked.current = false;
      setConflict(false);
      setError("");
      setSaved("Saved to workspace");
      try {
        sessionStorage.removeItem(recoveryKey(value.board.id));
      } catch {
        /* Optional recovery cache. */
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t reload your board.",
      );
    }
  }
  return {
    board,
    setBoard,
    loading,
    saved,
    error,
    setError,
    conflict,
    flush,
    retry,
    reloadLatest,
    repository,
    dirty: !!board && signature(board) !== acknowledged.current,
  };
}
