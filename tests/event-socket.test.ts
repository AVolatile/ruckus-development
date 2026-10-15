import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { hostCookie } from "./support/host-session.js";
import { emptyEvent, type EventDefinition } from "../shared/events.js";
import { GAME_IDS, type RoomView, type Reply } from "../shared/types.js";
import { newBoard } from "../shared/boards.js";
import { defaultBrandConfig } from "../shared/brand.js";
import sharp from "sharp";
const origin = process.env.TEST_ORIGIN;
test(
  "event sockets: seven mixed segments, one guest join, fresh reconnect, host command guards and private immutable imagery",
  { skip: !origin, timeout: 30000 },
  async () => {
    const cookie = await hostCookie(origin!),
      sockets: Socket[] = [];
    let checkpoint = "setup";
    async function api(path: string, body?: unknown, method?: string) {
      const r = await fetch(origin + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          Cookie: cookie,
          Origin: origin!,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.ok(r.ok, `HTTP ${r.status} for ${path}`);
      return r.json();
    }
    async function connect() {
      const s = io(origin!, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.once("connect", resolve);
        s.once("connect_error", reject);
      });
      return s;
    }
    const emit = (s: Socket, event: string, data: unknown) =>
      new Promise<Reply>((resolve, reject) => {
        s.timeout(5000).emit(event, data, (err: Error, reply: Reply) =>
          err
            ? reject(
                new Error(`Timed out waiting for ${event} at ${checkpoint}`),
              )
            : resolve(reply),
        );
      });
    try {
      const wid = (await api("/api/v1/workspaces")).items[0].id,
        base = `/api/v1/workspaces/${wid}`;
      const board = newBoard();
      board.title = "Socket event Studio";
      board.questions[0] = {
        ...board.questions[0],
        prompt: "Choose first",
        answers: ["First", "Second"],
        correctAnswer: 0,
      };
      const stored = await api(base + "/boards", { board });
      const image = await sharp({
        create: { width: 10, height: 10, channels: 3, background: "#2548f4" },
      })
        .png()
        .toBuffer();
      const upload = await fetch(origin + base + "/brand-assets?kind=logo", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: origin!,
          "Content-Type": "image/png",
        },
        body: image,
      });
      assert.equal(upload.status, 201);
      const asset = await upload.json();
      const brand = await api(base + "/brand-kits", {
        name: "Socket event Brand",
        config: { ...defaultBrandConfig, logoAssetId: asset.id },
      });
      const d = emptyEvent("One room, seven segments");
      d.brandKitId = brand.id;
      d.playlist = GAME_IDS.map((gameSlug, order) => ({
        type: "original" as const,
        itemId: randomUUID(),
        enabled: true,
        order,
        displayTitle: "",
        hostNote: "Private note",
        transitionLabel: "",
        gameSlug,
        settings: { rounds: 1, pace: "quick", pack: "mixed" },
      }));
      d.playlist.splice(1, 0, {
        type: "studio_board",
        itemId: randomUUID(),
        enabled: true,
        order: 1,
        displayTitle: "",
        hostNote: "Private board note",
        transitionLabel: "",
        boardId: stored.board.id,
        settings: {},
      } as EventDefinition["playlist"][number]);
      d.playlist = d.playlist.map((p, order) => ({ ...p, order }));
      const event = await api(base + "/events", { definition: d }),
        launch: Reply = await api(base + `/events/${event.id}/launch`, {
          baseRevisionId: event.revisionId,
        });
      assert.ok(launch.identity);
      const host = await connect(),
        b = await connect();
      let a = await connect();
      let state = launch.state!;
      host.on("room:state", (s: RoomView) => {
        state = s;
      });
      checkpoint = "initial host resume";
      assert.ok((await emit(host, "room:resume", launch.identity)).ok);
      const code = launch.identity!.code,
        joinedA = await emit(a, "room:join", {
          code,
          name: "Event guest one",
          avatar: 1,
        }),
        joinedB = await emit(b, "room:join", {
          code,
          name: "Event guest two",
          avatar: 2,
        });
      const aid = joinedA.state!.you!,
        bid = joinedB.state!.you!;
      assert.equal(joinedA.state?.event?.hostNote, undefined);
      assert.ok(
        !(await emit(a, "event:action", { action: "start", sequence: 0 })).ok,
      );
      const assetURL = state.event!.brand!.logo!;
      const imageResponse = await fetch(origin + assetURL);
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResponse.headers.get("content-type"), "image/webp");
      const frozenBytes = Buffer.from(await imageResponse.arrayBuffer());
      assert.equal(
        (await fetch(origin + base + `/brand-assets/${asset.id}`)).status,
        401,
      );
      assert.equal(
        (await fetch(origin + `/api/v1/event-assets/${asset.id}`)).status,
        404,
      );
      await api(
        base + `/brand-kits/${brand.id}`,
        {
          name: "Changed after launch",
          config: { ...brand.config, primaryColor: "#000000" },
          baseRevisionId: brand.revisionId,
        },
        "PUT",
      );
      await api(
        base + `/boards/${stored.board.id}`,
        {
          board: { ...stored.board, title: "Changed source" },
          baseRevisionId: stored.revisionId,
        },
        "PUT",
      );
      assert.deepEqual(
        Buffer.from(await (await fetch(origin + assetURL)).arrayBuffer()),
        frozenBytes,
      );
      async function command(action: string) {
        const seq = state.event!.sequence;
        const r = await emit(host, "event:action", { action, sequence: seq });
        assert.ok(r.ok, r.error);
        return seq;
      }
      async function gameNext() {
        const r = await emit(host, "host:action", {
          action: "next",
          expectedKey: state.roundKey,
        });
        assert.ok(r.ok, r.error);
      }
      const old = await command("start");
      assert.ok(
        !(
          await emit(host, "event:action", { action: "advance", sequence: old })
        ).ok,
      );
      await command("advance");
      for (let i = 0; i < 7; i++) {
        await command("advance");
        await gameNext();
        assert.equal(state.phase, "active");
        assert.equal(state.event!.segmentIndex, i);
        if (i === 4) await new Promise((resolve) => setTimeout(resolve, 5100));
        checkpoint = `segment ${i} player resume`;
        const fresh = await emit(a, "room:resume", joinedA.identity);
        assert.equal(fresh.state!.you, aid);
        assert.ok(!JSON.stringify(fresh.state).includes("correctAnswer"));
        assert.equal(fresh.state!.event!.hostNote, undefined);
        if (i === 1) {
          a.disconnect();
          const restored = await connect();
          const r = await emit(restored, "room:resume", joinedA.identity);
          assert.equal(r.state!.you, aid);
          assert.equal(r.state!.board!.title, "Socket event Studio");
          sockets[sockets.indexOf(a)] = restored;
          a = restored;
        }
        const first = sockets.find(
          (s) => s.connected && s !== host && s !== b,
        )!;
        const segment = d.playlist[i],
          creative =
            segment.type === "original" &&
            ["sellout", "caption-this", "scribble-shift"].includes(
              segment.gameSlug,
            );
        if (creative) {
          for (const [s, name] of [
            [first, "First"],
            [b, "Second"],
          ] as const) {
            const input =
              segment.gameSlug === "scribble-shift"
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
                : { text: name + " original creative answer" };
            assert.ok(
              (
                await emit(s, "player:input", {
                  input,
                  roundKey: state.roundKey,
                })
              ).ok,
            );
          }
          await gameNext();
          assert.equal(state.phase, "voting");
          const av = (await emit(first, "room:resume", joinedA.identity))
              .state!,
            bv = (await emit(b, "room:resume", joinedB.identity)).state!;
          assert.ok(
            (
              await emit(first, "player:input", {
                input: { vote: bv.ownEntryId },
                roundKey: state.roundKey,
              })
            ).ok,
          );
          assert.ok(
            (
              await emit(b, "player:input", {
                input: { vote: av.ownEntryId },
                roundKey: state.roundKey,
              })
            ).ok,
          );
          await gameNext();
        } else {
          assert.ok(
            (
              await emit(first, "player:input", {
                input: { choice: 0 },
                roundKey: state.roundKey,
              })
            ).ok,
          );
          assert.ok(
            (
              await emit(b, "player:input", {
                input: { choice: 1 },
                roundKey: state.roundKey,
              })
            ).ok,
          );
          if (state.phase === "active") await gameNext();
        }
        assert.equal(state.phase, "results");
        await gameNext();
        assert.equal(state.event!.state, "GAME_RESULTS");
        await command("advance");
        if (i < 6) {
          assert.equal(state.event!.state, "INTERMISSION");
          await command("advance");
        }
      }
      assert.equal(state.event!.state, "EVENT_FINAL");
      assert.equal(state.code, code);
      assert.equal(
        state.players.find((p) => p.id === bid)!.name,
        "Event guest two",
      );
      assert.equal(state.event!.scores[0].segments, 7);
      await command("end");
      assert.equal((await fetch(origin + assetURL)).status, 404);
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  },
);
