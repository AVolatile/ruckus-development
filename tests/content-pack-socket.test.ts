import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { hostCookie } from "./support/host-session.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { builtInPacks } from "../server/content-packs/built-ins.js";
import { defaultPackId } from "../shared/content-packs.js";
import type {
  Reply,
  ClientEvents,
  ServerEvents,
  RoomView,
} from "../shared/types.js";
const origin = process.env.TEST_ORIGIN;
test(
  "real selected-pack socket launch checks compatibility and keeps alternate answers private",
  { skip: !origin, timeout: 20000 },
  async () => {
    const cookie = await hostCookie(origin!);
    const wid = (
      await (
        await fetch(origin + "/api/v1/workspaces", {
          headers: { Cookie: cookie },
        })
      ).json()
    ).items[0].id;
    const host: Socket<ServerEvents, ClientEvents> = io(origin!, {
        transports: ["websocket"],
        reconnection: false,
        extraHeaders: { Cookie: cookie },
      }),
      guest: Socket<ServerEvents, ClientEvents> = io(origin!, {
        transports: ["websocket"],
        reconnection: false,
      });
    let hostView: RoomView | undefined;
    host.on("room:state", (state) => {
      hostView = state;
    });
    try {
      await Promise.all(
        [host, guest].map(
          (s) =>
            new Promise<void>((resolve, reject) => {
              s.once("connect", resolve);
              s.once("connect_error", reject);
            }),
        ),
      );
      const settings = {
        ...DEFAULT_SETTINGS,
        playlist: ["hotwire" as const],
        rounds: 1,
        autoAdvance: false,
      };
      const denied = await new Promise<Reply>((resolve) =>
        guest.emit("room:create", { settings }, resolve),
      );
      assert.equal(denied.ok, false);
      const invalid = await new Promise<Reply>((resolve) =>
        host.emit(
          "room:create",
          {
            settings,
            contentReference: {
              workspaceId: wid,
              selections: { hotwire: defaultPackId("sellout") },
            },
          },
          resolve,
        ),
      );
      assert.equal(invalid.ok, false);
      assert.match(invalid.error!, /compatible/);
      const food = builtInPacks.at(-1)!;
      const result = await new Promise<Reply>((resolve) =>
        host.emit(
          "room:create",
          {
            settings,
            demo: true,
            contentReference: {
              workspaceId: wid,
              selections: { hotwire: food.id },
            },
          },
          resolve,
        ),
      );
      assert.equal(result.ok, true);
      const joined = await new Promise<Reply>((resolve) =>
        guest.emit(
          "room:join",
          { code: result.identity!.code, name: "Food guest", avatar: 0 },
          resolve,
        ),
      );
      assert.equal(joined.ok, true);
      await new Promise<Reply>((resolve) =>
        host.emit("host:action", { action: "start" }, resolve),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      const active = await new Promise<Reply>((resolve) =>
        host.emit("host:action", { action: "next" }, resolve),
      );
      assert.equal(active.ok, true);
      assert.ok(
        food.document.content.items.some(
          (i) => i.title === hostView?.prompt?.title,
        ),
      );
      const restored = await new Promise<Reply>((resolve) =>
        guest.emit("room:resume", joined.identity!, resolve),
      );
      assert.equal(restored.ok, true);
      assert.equal("answer" in restored.state!.prompt!, false);
      assert.deepEqual(restored.state!.correct, []);
      assert.equal(restored.state!.prompt!.explanation, undefined);
      assert.equal("contentPack" in restored.state!, false);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await new Promise<Reply>((resolve) =>
        host.emit("host:action", { action: "end" }, resolve),
      );
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  },
);
