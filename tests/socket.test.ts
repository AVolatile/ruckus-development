import { hostCookie } from "./support/host-session.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvents,
  Identity,
  Input,
  Reply,
  RoomView,
  ServerEvents,
} from "../shared/types.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { GAME_IDS } from "../shared/types.js";
import { botDrawing } from "../server/engine.js";
const origin = process.env.TEST_ORIGIN;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test(
  "real sockets: host authority, two controllers, reconnect, all six game loops, late join, room lock and end",
  { skip: !origin, timeout: 60000 },
  async () => {
    const cookie = await hostCookie(origin!);
    const sockets: Socket<ServerEvents, ClientEvents>[] = [];
    async function client() {
      const socket: Socket<ServerEvents, ClientEvents> = io(origin!, {
        extraHeaders: { Cookie: cookie },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    }
    const states = new Map<Socket<ServerEvents, ClientEvents>, RoomView>();
    function track(s: Socket<ServerEvents, ClientEvents>) {
      s.on("room:state", (state) => states.set(s, state));
    }
    const action = (
      s: Socket<ServerEvents, ClientEvents>,
      action: "start" | "next" | "pause" | "lock" | "end",
    ) =>
      wait(300).then(
        () =>
          new Promise<Reply>((resolve) =>
            s.emit("host:action", { action }, resolve),
          ),
      );
    const input = (s: Socket<ServerEvents, ClientEvents>, input: Input) =>
      new Promise<Reply>((resolve) =>
        s.emit(
          "player:input",
          { input, roundKey: states.get(s)!.roundKey },
          resolve,
        ),
      );
    try {
      const host = await client();
      track(host);
      const create = await new Promise<Reply>((resolve) =>
        host.emit(
          "room:create",
          {
            settings: {
              ...DEFAULT_SETTINGS,
              playlist: [...GAME_IDS],
              rounds: 1,
              autoAdvance: false,
              pace: "quick",
            },
          },
          resolve,
        ),
      );
      assert.equal(create.ok, true);
      const code = create.identity!.code;
      assert.ok(create.state!.joinUrl.endsWith(`/join?room=${code}`));
      const p1 = await client(),
        p2 = await client();
      track(p1);
      track(p2);
      const join = (s: Socket<ServerEvents, ClientEvents>, name: string) =>
        new Promise<Reply>((resolve) =>
          s.emit("room:join", { code, name, avatar: 5 }, resolve),
        );
      const first = await join(p1, "Anthony");
      assert.equal(first.ok, true);
      assert.equal((await join(p2, "Maya")).ok, true);
      assert.equal((await action(p1, "start")).ok, false);
      assert.equal((await action(host, "lock")).ok, true);
      const late = await client();
      track(late);
      assert.match((await join(late, "Jamie")).error!, /locked/);
      await action(host, "lock");
      p1.disconnect();
      await wait(80);
      const recovered = await client();
      track(recovered);
      const resume = await new Promise<Reply>((resolve) =>
        recovered.emit("room:resume", first.identity as Identity, resolve),
      );
      assert.equal(resume.ok, true);
      assert.equal(resume.state!.you, first.state!.you);
      await action(host, "start");
      await action(host, "next");
      await wait(50);
      assert.equal(states.get(host)!.phase, "active");
      const lateReply = await join(late, "Jamie");
      assert.equal(lateReply.ok, true);
      assert.equal(lateReply.state!.eligible, false);
      assert.match(
        (
          await new Promise<Reply>((resolve) =>
            late.emit(
              "player:input",
              { input: { choice: 0 }, roundKey: lateReply.state!.roundKey },
              resolve,
            ),
          )
        ).error!,
        /next round/,
      );
      await action(host, "pause");
      assert.match((await input(p2, { choice: 0 })).error!, /paused/);
      await action(host, "pause");
      for (let index = 0; index < GAME_IDS.length; index++) {
        if (index > 0) {
          await action(host, "next");
          await wait(300);
          await action(host, "next");
          await wait(50);
        }
        const state = states.get(host)!;
        assert.equal(state.phase, "active");
        assert.equal(state.gameIndex, index);
        const game = GAME_IDS[index];
        const data: Input =
          game === "scribble-shift"
            ? { drawing: botDrawing(index) }
            : game === "sellout" || game === "caption-this"
              ? { text: `Original safe idea ${index}` }
              : { choice: 0 };
        assert.equal((await input(recovered, data)).ok, true);
        assert.equal(
          (
            await input(
              p2,
              game === "scribble-shift"
                ? { drawing: botDrawing(2) }
                : game === "sellout" || game === "caption-this"
                  ? { text: `Another safe idea ${index}` }
                  : { choice: 1 },
            )
          ).ok,
          true,
        );
        await action(host, "next");
        await wait(300);
        if (states.get(host)!.phase === "voting") {
          const a = states.get(recovered)!,
            b = states.get(p2)!;
          assert.ok(a.submissions.every((e) => !e.author));
          assert.equal(
            (
              await input(recovered, {
                vote: a.submissions.find((e) => e.id !== a.ownEntryId)!.id,
              })
            ).ok,
            true,
          );
          assert.equal(
            (
              await input(p2, {
                vote: b.submissions.find((e) => e.id !== b.ownEntryId)!.id,
              })
            ).ok,
            true,
          );
          await action(host, "next");
          await wait(300);
        }
        assert.equal(states.get(host)!.phase, "results");
        await action(host, "next");
        await wait(300);
      }
      assert.equal(states.get(host)!.phase, "final");
      assert.equal(states.get(host)!.stats.rounds, 6);
      assert.ok(states.get(host)!.players.some((p) => p.score > 0));
      await action(host, "end");
      await wait(50);
      assert.equal(states.get(p2)!.phase, "ended");
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  },
);
