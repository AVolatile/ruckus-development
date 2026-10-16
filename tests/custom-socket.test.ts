import { persistedRecap } from "./support/history-http.js";
import { hostCookie } from "./support/host-session.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { newBoard } from "../shared/boards.js";
import type { Reply, RoomView } from "../shared/types.js";
const origin = process.env.TEST_ORIGIN;
test(
  "custom boards through real sockets: hidden keys, right/wrong answers, timed expiry, bots, host and player reconnect",
  { skip: !origin, timeout: 25000 },
  async () => {
    const cookie = await hostCookie(origin!);
    const sockets: Socket[] = [];
    const connect = async () => {
      const s = io(origin!, {
        extraHeaders: { Cookie: cookie },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(s);
      await new Promise<void>((ok, no) => {
        s.once("connect", ok);
        s.once("connect_error", no);
      });
      return s;
    };
    const emit = (s: Socket, event: string, data: unknown) =>
      new Promise<Reply>((ok) => s.emit(event, data, ok));
    try {
      const host = await connect(),
        a = await connect(),
        b = await connect();
      const board = newBoard();
      board.title = "Live socket board";
      board.questions = [
        {
          ...board.questions[0],
          prompt: "Select the last answer",
          answers: ["First", "Second", "Third", "Fourth", "Fifth", "Last"],
          correctAnswer: 5,
          timer: 5,
          explanation: "Last means final.",
        },
        {
          ...board.questions[0],
          id: "tf",
          order: 1,
          type: "true-false",
          prompt: "This room is multiplayer.",
          answers: ["True", "False"],
          correctAnswer: 0,
          timer: 5,
        },
      ];
      const created = await emit(host, "room:create", {
        settings: { ...DEFAULT_SETTINGS, autoAdvance: false },
        board,
      });
      assert.ok(created.ok);
      const code = created.identity!.code;
      const joinedA = await emit(a, "room:join", {
          code,
          name: "Correct player",
          avatar: 0,
        }),
        joinedB = await emit(b, "room:join", {
          code,
          name: "Incorrect player",
          avatar: 1,
        });
      assert.ok(joinedA.ok && joinedB.ok);
      let state: RoomView = created.state!;
      host.on("room:state", (s: RoomView) => {
        state = s;
      });
      const waitFor = async (fn: () => boolean) => {
        const until = Date.now() + 10000;
        while (!fn()) {
          if (Date.now() > until) throw new Error("Socket state timeout");
          await new Promise((r) => setTimeout(r, 30));
        }
      };
      await emit(host, "host:action", { action: "start" });
      await emit(host, "host:action", { action: "next" });
      await waitFor(() => state.phase === "active");
      const restored = await emit(a, "room:resume", joinedA.identity);
      assert.ok(!JSON.stringify(restored.state).includes("correctAnswer"));
      assert.equal(restored.state?.prompt?.explanation, undefined);
      assert.equal(
        (await emit(a, "host:action", { action: "next" })).ok,
        false,
      );
      await emit(a, "player:input", {
        input: { choice: 5 },
        roundKey: state.roundKey,
      });
      await emit(b, "player:input", {
        input: { choice: 0 },
        roundKey: state.roundKey,
      });
      await waitFor(() => state.phase === "results");
      assert.equal(
        state.players.find((p) => p.name === "Correct player")?.score,
        500,
      );
      assert.equal(
        state.players.find((p) => p.name === "Incorrect player")?.score,
        0,
      );
      assert.equal(state.prompt?.explanation, "Last means final.");
      host.disconnect();
      const recovered = await connect();
      assert.ok((await emit(recovered, "room:resume", created.identity)).ok);
      recovered.on("room:state", (s: RoomView) => {
        state = s;
      });
      a.disconnect();
      const phone = await connect();
      assert.ok((await emit(phone, "room:resume", joinedA.identity)).ok);
      await emit(recovered, "host:action", { action: "next" });
      await waitFor(() => state.phase === "active");
      await emit(phone, "player:input", {
        input: { choice: 0 },
        roundKey: state.roundKey,
      });
      await waitFor(() => state.phase === "results");
      await emit(recovered, "host:action", { action: "next" });
      await waitFor(() => state.phase === "final");
      assert.equal(state.summary?.questions[1].timedOut, 1);
      assert.equal(state.summary?.questions.length, 2);
      const firstRecap = await persistedRecap(origin!, cookie, () => state);
      assert.equal(firstRecap.type, "studio");
      assert.equal(firstRecap.segments[0].rounds, 2);
      await emit(recovered, "host:action", { action: "rematch" });
      await waitFor(() => state.phase === "lobby");
      await emit(recovered, "host:action", { action: "bots", count: 8 });
      await waitFor(() => state.players.length === 10);
      await emit(recovered, "host:action", { action: "start" });
      await emit(recovered, "host:action", { action: "next" });
      await waitFor(() => state.phase === "results");
      assert.ok(state.players.filter((p) => p.bot && p.submitted).length > 0);
      await emit(recovered, "host:action", { action: "end" });
      const secondRecap = await persistedRecap(origin!, cookie, () => state);
      assert.notEqual(secondRecap.id, firstRecap.id);
      assert.equal(secondRecap.status, "ended_early");
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  },
);
