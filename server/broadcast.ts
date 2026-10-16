import type { Room } from "./engine.js";
import type { EventRuntime } from "./events/runtime.js";
import type { Identity, RoomView } from "../shared/types.js";
type LiveRoom = Room | EventRuntime;
export interface RoomRecipient {
  data: { identity?: unknown };
  emit: (event: "room:state", state: RoomView) => unknown;
}
/** Delayed completion callbacks must never address a replacement room by code. */
export function broadcastRoom(
  rooms: ReadonlyMap<string, LiveRoom>,
  recipients: Iterable<RoomRecipient>,
  room: LiveRoom,
  view: (room: LiveRoom, playerId?: string, host?: boolean) => RoomView = (
    room,
    id,
  ) => room.view(id),
) {
  if (rooms.get(room.code) !== room) return;
  for (const socket of recipients) {
    const identity = socket.data.identity as Identity | undefined;
    if (!identity || identity.code !== room.code) continue;
    if (identity.role === "host") {
      if (identity.token !== room.hostToken) continue;
      socket.emit("room:state", view(room, undefined, true));
    } else if (identity.role === "player") {
      const player = room.playerByToken(identity.token);
      if (player)
        socket.emit("room:state", view(room, player.public.id, false));
    }
  }
}

export interface RoomSubscription extends RoomRecipient {
  leave: (code: string) => unknown;
}
/** Expiry also retires channel membership before a code can be allocated again. */
export function retireRoom(
  rooms: Map<string, LiveRoom>,
  recipients: Iterable<RoomSubscription>,
  room: LiveRoom,
) {
  if (rooms.get(room.code) !== room) return;
  for (const socket of recipients) {
    const identity = socket.data.identity as Identity | undefined;
    if (identity?.code === room.code) {
      delete socket.data.identity;
      socket.leave(room.code);
    }
  }
  rooms.delete(room.code);
}
