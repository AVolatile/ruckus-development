import { useCallback, useEffect, useRef, useState } from "react";
import { request, ApiClientError } from "../lib/api";
import { useNavigate } from "../workspaces/navigation";
import { useHostAuth } from "../auth/HostAuth";
export function useRevisionDraft<
  D,
  F extends "definition" | "document",
  R extends { revisionId: string; revisionNumber: number } & Record<F, D>,
>(
  workspaceId: string,
  id: string | undefined,
  options: {
    field: F;
    resource: string;
    cacheNamespace?: string;
    schema: {
      parse(value: unknown): D;
      safeParse(value: unknown): { success: boolean };
    };
    conflictCode: string;
    label: string;
  },
) {
  const { field, resource, schema, conflictCode, label } = options;
  const navigate = useNavigate(),
    { user } = useHostAuth();
  const endpoint = `/api/v1/workspaces/${workspaceId}/${resource}/${id}`;
  const key = `ruckus-${options.cacheNamespace ?? resource}-draft-v1:${user?.id}:${workspaceId}:${id}`;
  const [definition, setDefinition] = useState<D>(),
    [loading, setLoading] = useState(true),
    [status, setStatus] = useState(`Loading ${label}…`),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const latest = useRef<D>(undefined),
    record = useRef<R>(undefined),
    ack = useRef(""),
    pending = useRef<Promise<R>>(undefined),
    blocked = useRef(false),
    mounted = useRef(true);
  const cache = useCallback(() => {
    try {
      if (latest.current && JSON.stringify(latest.current) !== ack.current)
        sessionStorage.setItem(
          key,
          JSON.stringify({
            definition: latest.current,
            baseRevisionId: record.current?.revisionId,
          }),
        );
      else sessionStorage.removeItem(key);
    } catch {
      /* Optional tab recovery. */
    }
  }, [key]);
  const load = useCallback(async () => {
    const r = await request<R>(endpoint);
    record.current = r;
    latest.current = r[field];
    ack.current = JSON.stringify(r[field]);
    blocked.current = false;
    setConflict(false);
    setError("");
    setStatus("Saved to workspace");
    setDefinition(r[field]);
    return r;
  }, [endpoint, field]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    blocked.current = false;
    setConflict(false);
    setError("");
    setLoading(true);
    void request<R>(endpoint)
      .then((r) => {
        if (!active) return;
        record.current = r;
        ack.current = JSON.stringify(r[field]);
        latest.current = r[field];
        try {
          const raw = sessionStorage.getItem(key);
          if (raw) {
            const saved = JSON.parse(raw),
              d = schema.parse(saved.definition);
            if (JSON.stringify(d) !== ack.current) {
              latest.current = d;
              if (saved.baseRevisionId !== r.revisionId) {
                blocked.current = true;
                setConflict(true);
                setError(
                  `Recovered edits have an older base. Export them before loading the latest ${label}.`,
                );
              }
            }
          }
        } catch {
          /* Invalid recovery never replaces cloud data. */
        }
        setDefinition(latest.current);
        setStatus(
          blocked.current
            ? "Conflict detected"
            : JSON.stringify(latest.current) === ack.current
              ? "Saved to workspace"
              : "Unsaved changes",
        );
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [endpoint, key, field, schema, label]);
  const update = useCallback(
    (d: D) => {
      latest.current = d;
      setDefinition(d);
      cache();
      if (!blocked.current)
        setStatus(pending.current ? "Saving…" : "Unsaved changes");
    },
    [cache],
  );
  const flush = useCallback(async (): Promise<R> => {
    if (blocked.current)
      throw new Error(
        "Resolve the save issue before continuing. Export your edits to keep a copy.",
      );
    if (pending.current) {
      await pending.current;
      return flush();
    }
    if (!latest.current || !record.current)
      throw new Error(`Wait for the ${label} to load.`);
    const job = async () => {
      while (latest.current && JSON.stringify(latest.current) !== ack.current) {
        const snapshot = structuredClone(latest.current);
        if (mounted.current) setStatus("Saving…");
        const r = await request<R>(endpoint, {
          method: "PUT",
          body: JSON.stringify({
            [field]: snapshot,
            baseRevisionId: record.current!.revisionId,
          }),
        });
        record.current = r;
        ack.current = JSON.stringify(snapshot);
        cache();
      }
      if (mounted.current) {
        setStatus("Saved to workspace");
        setError("");
      }
      return record.current!;
    };
    pending.current = job();
    try {
      return await pending.current;
    } catch (e) {
      blocked.current = true;
      if (mounted.current) {
        setConflict(e instanceof ApiClientError && e.code === conflictCode);
        setStatus("Save paused");
        setError(
          e instanceof Error
            ? e.message
            : "Your edits are unsaved. Retry or export them.",
        );
      }
      throw e;
    } finally {
      pending.current = undefined;
    }
  }, [endpoint, cache, field, conflictCode, label]);
  useEffect(() => {
    if (
      !definition ||
      blocked.current ||
      !schema.safeParse(definition).success ||
      JSON.stringify(definition) === ack.current
    )
      return;
    const timer = setTimeout(() => void flush().catch(() => {}), 750);
    return () => clearTimeout(timer);
  }, [definition, flush, schema]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (latest.current && JSON.stringify(latest.current) !== ack.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const leave = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        !latest.current ||
        JSON.stringify(latest.current) === ack.current
      )
        return;
      const a = (e.target as Element).closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void flush()
        .then(() => navigate(url.pathname + url.search + url.hash))
        .catch(() => {});
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", leave, true);
    };
  }, [flush, navigate]);
  return {
    definition,
    update,
    loading,
    status,
    error,
    setError,
    conflict,
    flush,
    retry: async () => {
      blocked.current = false;
      try {
        await flush();
      } catch {
        /* Visible save status. */
      }
    },
    reload: async () => {
      if (pending.current) await pending.current.catch(() => {});
      await load();
      cache();
    },
    record: record.current,
    revisionNumber: record.current?.revisionNumber,
    dirty: !!definition && JSON.stringify(definition) !== ack.current,
  };
}
