import { useCallback, useEffect, useState } from "react";
import type { BoardSummary } from "../../shared/cloud";
import { useBoardRepository } from "./RepositoryProvider";
export function useBoardLibrary() {
  const repository = useBoardRepository();
  const [items, setItems] = useState<BoardSummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await repository.list();
      setItems(page.items);
      setCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t load your library.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    void reload();
    const imported = () => {
      void reload();
    };
    window.addEventListener("ruckus:boards-imported", imported);
    return () => window.removeEventListener("ruckus:boards-imported", imported);
  }, [reload]);
  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await repository.list(cursor);
      setItems((current) => [
        ...current.filter(
          (item) => !page.items.some((next) => next.id === item.id),
        ),
        ...page.items,
      ]);
      setCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t load more boards.",
      );
    } finally {
      setLoading(false);
    }
  }
  return { items, loading, error, reload, cursor, loadMore, repository };
}
