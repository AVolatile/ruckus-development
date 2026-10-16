import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { localAudioFeedback } from "../audio/feedback";
import type { CustomBoard } from "../../shared/boards";
import { realtimeUrl } from "./runtime";
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvents,
  HostAction,
  Identity,
  Input,
  Reply,
  RoomView,
  ServerEvents,
  Settings,
} from "../../shared/types";
const socket: Socket<ServerEvents, ClientEvents> = io(
  import.meta.env.VITE_REALTIME_URL?.trim() || undefined,
  {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 700,
  },
);
interface PartyContext {
  room: RoomView | null;
  identity: Identity | null;
  connected: boolean;
  synchronized: boolean;
  audioEpoch: number;
  error: string;
  clearError: () => void;
  eventAction: (
    action: import("../../shared/events").EventCommand,
  ) => Promise<Reply>;
  create: (
    settings: Settings,
    demo?: boolean,
    board?: CustomBoard,
    boardReference?: { workspaceId: string; boardId: string },
    contentReference?: {
      workspaceId: string;
      selections: Partial<Record<import("../../shared/types").GameId, string>>;
    },
  ) => Promise<Reply>;
  join: (code: string, name: string, avatar: number) => Promise<Reply>;
  resume: (identity: Identity) => Promise<Reply>;
  action: (
    action: HostAction,
    count?: number,
    playerId?: string,
  ) => Promise<Reply>;
  input: (input: Input) => Promise<Reply>;
  reaction: (emoji: string) => void;
  reactions: { id: string; emoji: string; name: string }[];
}
const Context = createContext<PartyContext | null>(null);
function readIdentity(): Identity | null {
  try {
    return JSON.parse(sessionStorage.getItem("ruckus-session") ?? "null");
  } catch {
    return null;
  }
}
export function PartyProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<RoomView | null>(null),
    [identity, setIdentity] = useState<Identity | null>(readIdentity),
    [connected, setConnected] = useState(false),
    [synchronized, setSynchronized] = useState(false),
    [audioEpoch, setAudioEpoch] = useState(0),
    [error, setError] = useState(""),
    [reactions, setReactions] = useState<PartyContext["reactions"]>([]);
  const location = useLocation();
  const liveRoute = /^\/(app\/(?:w\/[^/]+\/)?host|join|room)(\/|$)/.test(
    location.pathname,
  );
  const identityRef = useRef(identity);
  const reactionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  function accept(reply: Reply) {
    if (reply.ok) {
      setError("");
      if (reply.identity) {
        identityRef.current = reply.identity;
        setIdentity(reply.identity);
        sessionStorage.setItem(
          "ruckus-session",
          JSON.stringify(reply.identity),
        );
      }
      if (reply.state) {
        setRoom(reply.state);
        if (reply.identity) {
          setSynchronized(true);
          setAudioEpoch((n) => n + 1);
        }
      }
    } else setError(reply.error ?? "Try again in a moment.");
    return reply;
  }
  async function resume(saved: Identity) {
    await ensureConnection();
    setSynchronized(false);
    return new Promise<Reply>((resolve) =>
      socket.timeout(7000).emit("room:resume", saved, (err, reply) =>
        resolve(
          accept(
            err
              ? {
                  ok: false,
                  error: "We couldn’t reach the stage. Check your connection.",
                }
              : reply,
          ),
        ),
      ),
    );
  }
  useEffect(() => {
    const timers = reactionTimers.current;
    const onConnect = () => {
      setConnected(true);
      const saved = identityRef.current;
      if (saved)
        socket.emit("room:resume", saved, (reply) => {
          if (reply.ok && reply.state) {
            setRoom(reply.state);
            setSynchronized(true);
            setAudioEpoch((n) => n + 1);
            setError("");
          } else {
            setError(reply.error ?? "Session expired.");
            setRoom(null);
            identityRef.current = null;
            setIdentity(null);
            sessionStorage.removeItem("ruckus-session");
          }
        });
    };
    const onDisconnect = () => {
      setConnected(false);
      setSynchronized(false);
    };
    const onRemoved = (message: string) => {
      setSynchronized(false);
      setError(message);
      setRoom(null);
      setIdentity(null);
      identityRef.current = null;
      sessionStorage.removeItem("ruckus-session");
    };
    const onReaction = (reaction: PartyContext["reactions"][number]) => {
      setReactions((r) => [...r.slice(-7), reaction]);
      timers.push(
        setTimeout(
          () => setReactions((r) => r.filter((x) => x.id !== reaction.id)),
          3500,
        ),
      );
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", setRoom);
    socket.on("room:removed", onRemoved);
    socket.on("room:reaction", onReaction);
    socket.on("connect_error", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", setRoom);
      socket.off("room:removed", onRemoved);
      socket.off("room:reaction", onReaction);
      socket.off("connect_error", onDisconnect);
      timers.forEach(clearTimeout);
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (liveRoute) {
      try {
        realtimeUrl();
        socket.connect();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check the live-stage URL.");
      }
    } else socket.disconnect();
  }, [liveRoute]);
  async function ensureConnection() {
    realtimeUrl();
    if (socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        socket.off("connect", done);
        resolve();
      };
      const timer = setTimeout(() => {
        socket.off("connect", done);
        socket.disconnect();
        reject(
          new Error(
            "The live stage is unavailable. Wait a moment and try again.",
          ),
        );
      }, 10000);
      socket.once("connect", done);
      socket.connect();
    });
  }
  const create = async (
    settings: Settings,
    demo = false,
    board?: CustomBoard,
    boardReference?: { workspaceId: string; boardId: string },
    contentReference?: {
      workspaceId: string;
      selections: Partial<Record<import("../../shared/types").GameId, string>>;
    },
  ) => {
    try {
      await ensureConnection();
    } catch (error) {
      return accept({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Couldn’t reach the live stage.",
      });
    }
    return new Promise<Reply>((resolve) =>
      socket
        .timeout(7000)
        .emit(
          "room:create",
          { settings, demo, board, boardReference, contentReference },
          (err, reply) =>
            resolve(
              accept(
                err
                  ? {
                      ok: false,
                      error:
                        "The stage is offline. Check that the server is running.",
                    }
                  : reply,
              ),
            ),
        ),
    );
  };
  const join = (code: string, name: string, avatar: number) =>
    new Promise<Reply>((resolve) =>
      socket
        .timeout(7000)
        .emit("room:join", { code, name, avatar }, (err, reply) =>
          resolve(
            accept(
              err
                ? {
                    ok: false,
                    error:
                      "Couldn’t connect. Check your network and try again.",
                  }
                : reply,
            ),
          ),
        ),
    );
  const action = (action: HostAction, count?: number, playerId?: string) =>
    new Promise<Reply>((resolve) =>
      socket.timeout(7000).emit(
        "host:action",
        {
          action,
          count,
          playerId,
          expectedKey: room?.event ? room.roundKey : undefined,
        },
        (err, reply) =>
          resolve(
            accept(
              err
                ? {
                    ok: false,
                    error: "The stage didn’t respond. Reconnect and try again.",
                  }
                : reply,
            ),
          ),
      ),
    );
  const input = (input: Input) => {
    if ("choice" in input) localAudioFeedback("select");
    return new Promise<Reply>((resolve) =>
      socket
        .timeout(7000)
        .emit(
          "player:input",
          { input, roundKey: room?.roundKey ?? "" },
          (err, reply) => {
            const result = accept(
              err
                ? {
                    ok: false,
                    error:
                      "We didn’t get confirmation. Check your connection before trying again.",
                  }
                : reply,
            );
            if (result.ok)
              localAudioFeedback("vote" in input ? "vote" : "confirm");
            resolve(result);
          },
        ),
    );
  };
  const reaction = (emoji: string) =>
    socket.emit("player:reaction", { emoji }, (reply) => {
      if (!reply.ok) setError(reply.error ?? "Reaction unavailable.");
    });
  return (
    <Context.Provider
      value={{
        room,
        identity,
        connected,
        synchronized,
        audioEpoch,
        error,
        clearError: () => setError(""),
        eventAction: (action) =>
          new Promise<Reply>((resolve) =>
            socket
              .timeout(7000)
              .emit(
                "event:action",
                { action, sequence: room?.event?.sequence ?? 0 },
                (err, reply) =>
                  resolve(
                    accept(
                      err
                        ? {
                            ok: false,
                            error:
                              "The event did not respond. Reconnect and check its current state.",
                          }
                        : reply,
                    ),
                  ),
              ),
          ),
        create,
        join,
        resume,
        action,
        input,
        reaction,
        reactions,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useParty() {
  const context = useContext(Context);
  if (!context) throw new Error("PartyProvider is missing");
  return context;
}
