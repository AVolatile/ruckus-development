import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { hostCookie } from "./support/host-session.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { CueScheduler } from "../src/audio/CueScheduler.js";
import type { RoomView, Reply } from "../shared/types.js";
const origin = process.env.TEST_ORIGIN;
test(
  "socket audio semantics are authoritative, monotonic and safe to baseline on standalone reconnect",
  { skip: !origin, timeout: 15000 },
  async () => {
    const cookie = await hostCookie(origin!),
      sockets: Socket[] = [];
    async function connect() {
      const socket = io(origin!, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
        extraHeaders: { Cookie: cookie },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    }
    const emit = (socket: Socket, event: string, data: unknown) =>
      new Promise<Reply>((resolve) => socket.emit(event, data, resolve));
    try {
      const host = await connect();
      const created = await emit(host, "room:create", {
        settings: {
          ...DEFAULT_SETTINGS,
          playlist: ["hotwire"],
          rounds: 1,
          autoAdvance: false,
        },
        demo: true,
      });
      assert.ok(created.ok);
      let state: RoomView = created.state!;
      host.on("room:state", (value) => {
        state = value;
      });
      const scheduler = new CueScheduler();
      assert.deepEqual(scheduler.consume(state.audio!, 0, true), []);
      await emit(host, "host:action", { action: "start" });
      const intro = state.audio!;
      assert.ok(intro.names.includes("EVENT_START"));
      assert.equal(scheduler.consume(intro, 0).length, 1);
      assert.equal(scheduler.consume(intro, 0).length, 0);
      await emit(host, "host:action", { action: "next" });
      assert.equal(state.audio!.stage, "gameplay");
      assert.equal(state.audio!.profile, "hotwire");
      assert.ok(state.audio!.sequence > intro.sequence);
      assert.equal(state.audio!.remainingMs !== null, true);
      await emit(host, "host:action", { action: "pause" });
      assert.equal(state.audio!.paused, true);
      const paused = state.audio!;
      await emit(host, "host:action", { action: "pause" });
      assert.equal(state.audio!.sequence, paused.sequence);
      await emit(host, "host:action", { action: "next" });
      assert.ok(state.audio!.names.includes("REVEAL_ENTER"));
      const reveal = state.audio!;
      const restored = await connect();
      const reply = await emit(restored, "room:resume", created.identity);
      assert.equal(reply.state!.audio!.sequence, reveal.sequence);
      assert.equal(reply.state!.audio!.occurredAt, reveal.occurredAt);
      assert.equal(reply.state!.audio!.roomId, created.state!.audio!.roomId);
      assert.equal(
        new CueScheduler().consume(reply.state!.audio!, 0, true).length,
        0,
      );
      assert.ok(!JSON.stringify(reply.state!.audio).includes("answer"));
      await emit(restored, "host:action", { action: "end" });
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  },
);
