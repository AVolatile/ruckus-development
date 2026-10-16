import { randomUUID } from "node:crypto";
import { Room } from "../../server/engine.js";
import { buildSessionSummary } from "../../server/history/outcomes.js";
import { DEFAULT_SETTINGS } from "../../shared/catalog.js";
import type { GameId } from "../../shared/types.js";
import type { CustomBoard } from "../../shared/boards.js";
export function playRoom(
  game: GameId = "hotwire",
  board?: CustomBoard,
  onChange?: (room: Room) => void,
) {
  const room = new Room(
    "ABCDE",
    { ...DEFAULT_SETTINGS, playlist: [game], rounds: 1, autoAdvance: false },
    "http://localhost/join",
    () => onChange?.(room),
    board,
  );
  const a = room.join("First guest", 0, "first"),
    b = room.join("Second guest", 1, "second");
  room.action("start");
  room.action("next");
  if (["sellout", "caption-this", "scribble-shift"].includes(game) && !board) {
    const input =
      game === "scribble-shift"
        ? {
            drawing: [
              {
                color: "#191a24",
                width: 3,
                points: [
                  [0, 0],
                  [1, 1],
                ] as [number, number][],
              },
            ],
          }
        : { text: "PRIVATE CREATIVE ARTIFACT" };
    room.submit(a.id, input);
    room.submit(b.id, input);
    room.action("next");
    room.submit(a.id, { vote: room.view(b.id).ownEntryId! });
    room.submit(b.id, { vote: room.view(a.id).ownEntryId! });
    room.action("next");
  } else {
    room.submit(a.id, { choice: room.prompt?.answer ?? 0 });
    room.submit(b.id, { choice: room.prompt?.answer ?? 0 });
    if (room.phase === "active") room.action("next");
  }
  room.action("next");
  return room;
}
export function roomSummary(
  room: Room,
  workspaceId = randomUUID(),
  hostUserId = randomUUID(),
) {
  return buildSessionSummary(room, {
    workspaceId,
    hostUserId,
    type: room.board ? "studio" : "original",
    title: room.board?.title ?? "Original night",
    source: room.board ? {} : { gameType: room.settings.playlist[0] },
  })!;
}
