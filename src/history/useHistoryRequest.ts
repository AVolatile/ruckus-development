import { useEffect, useState } from "react";
import { request } from "../lib/api";
export function useHistoryRequest<T>(path: string) {
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ path, data: null, error: "", loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void request<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, data, error: "", loading: false });
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted)
          setState({ path, data: null, error: e.message, loading: false });
      });
    return () => controller.abort();
  }, [path, retry]);
  return {
    ...(state.path === path ? state : { data: null, error: "", loading: true }),
    reload: () => {
      setState({ path, data: null, error: "", loading: true });
      setRetry((n) => n + 1);
    },
  };
}
