import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS } from "../../shared/catalog";
import { newBoard, type CustomBoard } from "../../shared/boards";
import { emptyEvent, type EventDefinition } from "../../shared/events";
import type { GameId, Identity, Reply } from "../../shared/types";
import type { Page } from "@playwright/test";
import { appOrigin, expect } from "./fixtures";
export async function playedSession(
  page: Page,
  kind: "original" | "studio" | "poll" | "event",
  game: GameId = "hotwire",
) {
  const wid = (await (await page.request.get("/api/v1/workspaces")).json())
      .items[0].id,
    base = `/api/v1/workspaces/${wid}`;
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(base + path, {
      headers: { Origin: appOrigin },
      data,
    });
    expect(r.ok(), `Create ${path}: ${r.status()}`).toBe(true);
    return r.json();
  };
  let board: { board: CustomBoard; revisionId: string } | undefined;
  if (kind !== "original") {
    const draft = newBoard();
    draft.title =
      kind === "poll" ? "The room has opinions" : "Inside knowledge";
    draft.questions[0] = {
      ...draft.questions[0],
      prompt: "Which one?",
      answers: ["First", "Second"],
      correctAnswer: kind === "poll" ? null : 0,
      type: kind === "poll" ? "poll" : "multiple-choice",
      scoreMode: kind === "poll" ? "no-score" : "casual",
    };
    board = await post("/boards", { board: draft });
  }
  const cookies = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; "),
    sockets: Socket[] = [];
  const connect = async (host = false) => {
    const socket = io(appOrigin, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: host ? { Cookie: cookies } : undefined,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  };
  const emit = (s: Socket, event: string, data: unknown) =>
    new Promise<Reply>((resolve, reject) =>
      s
        .timeout(5000)
        .emit(event, data, (e: Error, r: Reply) =>
          e
            ? reject(e)
            : r.ok
              ? resolve(r)
              : reject(Error(`${event}: ${r.error}`)),
        ),
    );
  const host = await connect(true);
  let created: Reply,
    eventId: string | undefined,
    eventRevisionId: string | undefined;
  const segments =
    kind === "event"
      ? ["room-temperature", "caption-this", "studio"]
      : [kind === "original" ? game : "studio"];
  try {
    if (kind === "event") {
      const definition = emptyEvent("A little of everything");
      definition.eventSettings.showEventIntro = false;
      definition.eventSettings.showFinalEventLeaderboard = false;
      definition.eventSettings.showIntermissionBetweenGames = false;
      definition.playlist = segments.map((g, order) => ({
        itemId: randomUUID(),
        enabled: true,
        order,
        displayTitle: "",
        hostNote: "",
        transitionLabel: "",
        ...(g === "studio"
          ? { type: "studio_board", boardId: board!.board.id, settings: {} }
          : {
              type: "original",
              gameSlug: g,
              settings: { rounds: 1, pace: "quick", pack: "mixed" },
            }),
      })) as EventDefinition["playlist"];
      const event = await post("/events", { definition });
      eventId = event.id;
      eventRevisionId = event.revisionId;
      created = await post(`/events/${event.id}/launch`, {
        baseRevisionId: event.revisionId,
      });
      await emit(host, "room:resume", created.identity);
    } else
      created = await emit(host, "room:create", {
        settings: {
          ...DEFAULT_SETTINGS,
          playlist: [game],
          rounds: 1,
          autoAdvance: false,
        },
        ...(kind === "original"
          ? { contentReference: { workspaceId: wid, selections: {} } }
          : { boardReference: { workspaceId: wid, boardId: board!.board.id } }),
      });
    let state = created.state!;
    host.on("room:state", (s) => {
      state = s;
    });
    const a = await connect(),
      b = await connect(),
      code = created.identity!.code;
    const aa = await emit(a, "room:join", {
        code,
        name: "Maya guest",
        avatar: 1,
      }),
      bb = await emit(b, "room:join", {
        code,
        name: "Jordan guest",
        avatar: 2,
      });
    const sync = async () => {
      state = (await emit(host, "room:resume", created.identity)).state!;
    };
    const next = async () => {
      await emit(host, "host:action", {
        action: "next",
        expectedKey: state.roundKey,
      });
      await sync();
    };
    const command = async (action: string) => {
      await emit(host, "event:action", {
        action,
        sequence: state.event!.sequence,
      });
      await sync();
    };
    await sync();
    if (kind === "event") await command("start");
    else await emit(host, "host:action", { action: "start" });
    for (const segment of segments) {
      if (kind === "event") await command("advance");
      await next();
      for (const [s, who] of [
        [a, "Maya"],
        [b, "Jordan"],
      ] as const) {
        const input = ["caption-this", "sellout"].includes(segment)
          ? { text: `${who} PRIVATE creative answer` }
          : segment === "scribble-shift"
            ? {
                drawing: [
                  {
                    color: "#191a24",
                    width: 3,
                    points: [
                      [0, 0],
                      [1, 1],
                    ],
                  },
                ],
              }
            : { choice: 0 };
        await emit(s, "player:input", { input, roundKey: state.roundKey });
      }
      await sync();
      if (state.phase === "active") await next();
      if (state.phase === "voting") {
        const av = (await emit(a, "room:resume", aa.identity)).state!,
          bv = (await emit(b, "room:resume", bb.identity)).state!;
        await emit(a, "player:input", {
          input: { vote: bv.ownEntryId },
          roundKey: state.roundKey,
        });
        await emit(b, "player:input", {
          input: { vote: av.ownEntryId },
          roundKey: state.roundKey,
        });
        await next();
      }
      await next();
      if (kind === "event") await command("advance");
    }
    await expect
      .poll(() => state.history?.status, { timeout: 15000 })
      .toBe("saved");
    // Anonymous guests never receive host history status or a history API identity.
    expect(
      (await emit(a, "room:resume", aa.identity)).state!.history,
    ).toBeUndefined();
    const recap = await (
      await page.request.get(base + `/sessions/${state.history!.sessionId}`)
    ).json();
    return {
      wid,
      base,
      identity: created.identity!,
      state,
      recap,
      eventId,
      eventRevisionId,
      boardId: board?.board.id,
    };
  } finally {
    sockets.forEach((s) => s.disconnect());
  }
}
export async function restoreStage(page: Page, identity: Identity) {
  await page.addInitScript(
    (i) => sessionStorage.setItem("ruckus-session", JSON.stringify(i)),
    identity,
  );
  await page.goto(`/room/${identity.code}/host`);
}
