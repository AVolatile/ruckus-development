import { io, type Socket } from "socket.io-client";
import { DEFAULT_SETTINGS } from "../../shared/catalog";
import type { GameId, Identity, Reply } from "../../shared/types";
import { expect, appOrigin } from "./fixtures";
import type { Page } from "@playwright/test";
export async function seededRoom(page: Page, playlist: GameId[] = ["hotwire"]) {
  const socket: Socket = io(appOrigin, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: {
      Cookie: (await page.context().cookies())
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  const result = await new Promise<Reply>((resolve) =>
    socket.emit(
      "room:create",
      {
        settings: {
          ...DEFAULT_SETTINGS,
          playlist,
          rounds: 1,
          autoAdvance: false,
        },
        demo: true,
      },
      resolve,
    ),
  );
  expect(result.ok).toBe(true);
  const user = (await (await page.request.get("/api/v1/me")).json()).user;
  await page.addInitScript(
    ({ identity, owner }: { identity: Identity; owner: string }) => {
      sessionStorage.setItem("ruckus-session", JSON.stringify(identity));
      sessionStorage.setItem("ruckus-audio-owner-v1", owner);
    },
    { identity: result.identity!, owner: user.id },
  );
  return { socket, identity: result.identity! };
}

// Observe actual native loop nodes independently of the engine's bookkeeping.
export async function observeMusic(page: Page) {
  await page.addInitScript(() => {
    const contexts = new Set<AudioContext>();
    const records: {
      source: AudioBufferSourceNode;
      context: AudioContext;
      started: boolean;
      ended: boolean;
      disconnected: boolean;
    }[] = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      contexts.add(this);
      const source = create.call(this);
      const record = {
        source,
        context: this,
        started: false,
        ended: false,
        disconnected: false,
      };
      records.push(record);
      const start = source.start.bind(source),
        disconnect = source.disconnect.bind(source);
      source.start = (...args: Parameters<typeof source.start>) => {
        start(...args);
        record.started = true;
      };
      source.disconnect = () => {
        disconnect();
        record.disconnected = true;
      };
      source.addEventListener("ended", () => {
        record.ended = true;
      });
      return source;
    };
    Object.defineProperty(window, "__ruckusMusicProbe", {
      value: () => {
        const loops = records.filter(
          (r) => r.source.loop && r.started && !r.disconnected,
        );
        return {
          connected: loops.length,
          playing: loops.filter((r) => !r.ended).length,
          contexts: contexts.size,
        };
      },
    });
  });
}
export async function singleBed(page: Page, track: string) {
  const status = page.locator("[data-audio-state]");
  await expect(status).toHaveAttribute("data-audio-track", track);
  await expect(status).toHaveAttribute("data-audio-requested-track", track);
  await expect(status).toHaveAttribute("data-audio-music-current", "1");
  await expect(status).toHaveAttribute("data-audio-music-retiring", "0");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __ruckusMusicProbe: () => {
              connected: number;
              playing: number;
              contexts: number;
            };
          }
        ).__ruckusMusicProbe(),
      ),
    )
    .toEqual({ connected: 1, playing: 1, contexts: 1 });
}
