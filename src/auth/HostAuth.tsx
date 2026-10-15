import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { HostUser } from "../../shared/cloud";
import { ApiClientError, request } from "../lib/api";
interface AuthState {
  user: HostUser | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<AuthState | null>(null);
export function HostAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<HostUser | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const data = await request<{ user: HostUser }>("/api/v1/me");
      if (current !== generation.current) return;
      setUser(data.user);
      setError("");
    } catch (cause) {
      if (current !== generation.current) return;
      setUser(null);
      setError(
        cause instanceof ApiClientError && cause.status === 401
          ? ""
          : "Couldn’t check your account. Try again.",
      );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const expire = () => {
      generation.current++;
      setUser(null);
      setError("");
      setLoading(false);
    };
    const focus = () => {
      void refresh();
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("ruckus-auth")
        : null;
    if (channel)
      channel.onmessage = () => {
        void refresh();
      };
    window.addEventListener("ruckus:auth-expired", expire);
    window.addEventListener("focus", focus);
    return () => {
      channel?.close();
      window.removeEventListener("ruckus:auth-expired", expire);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function logout() {
    generation.current++;
    await request("/api/auth/sign-out", { method: "POST", body: "{}" });
    setUser(null);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("ruckus-auth");
      channel.postMessage("changed");
      channel.close();
    }
  }
  return (
    <Context.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useHostAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("HostAuthProvider is missing");
  return context;
}
