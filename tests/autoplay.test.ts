import { persistedRecap } from "./support/history-http.js";
import { hostCookie } from "./support/host-session.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import type { ClientEvents, Reply, ServerEvents } from "../shared/types.js";
const origin = process.env.AUTOPLAY_ORIGIN;
test(
  "12 demo players finish a three-game session automatically with real submissions and votes",
  { skip: !origin, timeout: 170000 },
  async () => {
    const cookie = await hostCookie(origin!);
    const socket: Socket<ServerEvents, ClientEvents> = io(origin!, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      const created = await new Promise<Reply>((resolve) =>
        socket.emit(
          "room:create",
          { settings: { ...DEFAULT_SETTINGS, rounds: 1, pace: "quick" } },
          resolve,
        ),
      );
      assert.equal(created.ok, true);
      const bots = await new Promise<Reply>((resolve) =>
        socket.emit("host:action", { action: "bots", count: 12 }, resolve),
      );
      assert.equal(bots.ok, true);
      const finished = new Promise<void>((resolve, reject) => {
        socket.on("room:state", (state) => {
          if (state.phase === "final") {
            try {
              assert.equal(state.players.length, 12);
              assert.equal(state.stats.rounds, 3);
              assert.equal(state.stats.answers, 36);
              assert.ok(state.players.some((p) => p.votes > 0));
              assert.ok(state.players.every((p) => p.bot && p.score >= 0));
              resolve();
            } catch (e) {
              reject(e);
            }
          }
        });
        socket.once("disconnect", () =>
          reject(new Error("Server disconnected during autoplay.")),
        );
      });
      const start = await new Promise<Reply>((resolve) =>
        socket.emit("host:action", { action: "start" }, resolve),
      );
      assert.equal(start.ok, true);
      await finished;
      let finalState = (
        await new Promise<Reply>((resolve) =>
          socket.emit("room:resume", created.identity!, resolve),
        )
      ).state!;
      socket.on("room:state", (s) => {
        finalState = s;
      });
      const recap = await persistedRecap(origin!, cookie, () => finalState);
      assert.equal(recap.demoCount, 12);
      assert.equal(recap.segments.length, 3);
      const ended = await new Promise<Reply>((resolve) =>
        socket.emit("host:action", { action: "end" }, resolve),
      );
      assert.equal(ended.ok, true);
    } finally {
      socket.disconnect();
    }
  },
);
