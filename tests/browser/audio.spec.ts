import { test, expect, appOrigin } from "./fixtures";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_SETTINGS } from "../../shared/catalog";
import type { Identity, Reply } from "../../shared/types";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
const audio = (page: Page) => page.locator("[data-audio-state]");
async function seededRoom(page: Page) {
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
          playlist: ["hotwire"],
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
test("host gesture unlock, independent mix, countdown, muted phone and refresh baseline use real decoded audio", async ({
  page,
  browser,
}) => {
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { socket, identity } = await seededRoom(page);
  const phoneContext = await browser.newContext({
      baseURL: appOrigin,
      viewport: { width: 390, height: 844 },
    }),
    phone = await phoneContext.newPage();
  try {
    await page.goto(`/room/${identity.code}/host`);
    await expect(
      page.getByRole("heading", { name: "Look who showed up." }),
    ).toBeVisible();
    await expect(audio(page)).toHaveAttribute("data-audio-state", "locked");
    await phone.goto(`/join?room=${identity.code}`);
    await phone.getByLabel("What should we call you?").fill("Quiet guest");
    await phone.getByRole("button", { name: "I’m in. Let’s go." }).click();
    await expect(audio(phone)).toHaveAttribute("data-audio-track", "");
    await phone
      .getByRole("button", { name: "Phone sound on", exact: true })
      .click();
    await expect(
      phone.getByRole("button", { name: "Phone sound off", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
    await expect(audio(page)).toHaveAttribute("data-audio-context", "running");
    await expect(audio(page)).toHaveAttribute("data-audio-track", "intro");
    await page.getByRole("button", { name: "Pause P", exact: true }).click();
    await page.getByText("Music & effects", { exact: true }).click();
    await page.getByLabel("Music enabled", { exact: true }).uncheck();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "");
    await expect(
      page.getByLabel("Effects enabled", { exact: true }),
    ).toBeChecked();
    await page.getByLabel("Music enabled", { exact: true }).check();
    await page.getByLabel("Effects enabled", { exact: true }).uncheck();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "intro");
    await page.getByLabel("Effects enabled", { exact: true }).check();
    const slider = page.getByRole("slider", { name: /Music volume/ });
    await slider.focus();
    await slider.press("Home");
    for (let i = 0; i < 7; i++) await slider.press("ArrowRight");
    await expect(slider).toHaveValue("35");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await mkdir("test-results/phase-3-5", { recursive: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390)
        await page.screenshot({
          path: "test-results/phase-3-5/host-mixer-mobile.png",
          fullPage: true,
        });
    }
    await page.screenshot({
      path: "test-results/phase-3-5/host-mixer.png",
      fullPage: true,
    });
    await page.getByText("Music & effects", { exact: true }).click();
    await page.getByRole("button", { name: "Resume P", exact: true }).click();
    await page.getByRole("button", { name: "We’re ready" }).click();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "hotwire");
    await phone.locator(".player-answer").first().click();
    await expect(
      phone.getByRole("heading", { name: "Locked. Loaded. Lovely." }),
    ).toBeVisible();
    await phone.reload();
    await expect(
      phone.getByRole("button", { name: "Phone sound off", exact: true }),
    ).toBeVisible();
    await expect(audio(phone)).toHaveAttribute("data-audio-track", "");
    await expect
      .poll(
        async () => Number(await audio(page).getAttribute("data-audio-ticks")),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await expect(page.locator(".round-reveal")).toBeVisible({ timeout: 12000 });
    await expect(audio(page)).toHaveAttribute("data-audio-track", "results");
    const shots = await audio(page).getAttribute("data-audio-shots");
    await phone.reload();
    await expect(audio(page)).toHaveAttribute("data-audio-shots", shots!);
    await page.reload();
    await expect(audio(page)).toHaveAttribute("data-audio-state", "locked");
    await page
      .getByRole("button", { name: "Enable sound", exact: true })
      .click();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "results");
    await expect(audio(page)).toHaveAttribute("data-audio-shots", "0");
    await page.getByText("Music & effects", { exact: true }).click();
    await expect(
      page.getByRole("slider", { name: /Music volume/ }),
    ).toHaveValue("35");
    await page.getByText("Music & effects", { exact: true }).click();
    await page.getByRole("button", { name: "Next →", exact: true }).click();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "finale");
    await expect(audio(page)).toHaveAttribute("data-audio-shots", "1");
    await phone.reload();
    await expect(audio(page)).toHaveAttribute("data-audio-shots", "1");
    expect(errors).toEqual([]);
  } finally {
    socket.disconnect();
    await phoneContext.close();
  }
});

test("public, account, Studio and Event editor routes do not fetch soundtrack assets", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/audio/")) requests.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Clock out of ordinary." }),
  ).toBeVisible();
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", {
      name: "A little louder. Or a little quieter.",
    }),
  ).toBeVisible();
  await page.goto("/app/studio");
  await expect(page.locator("main h1")).toBeVisible();
  await page.goto("/app/events");
  await page.getByRole("button", { name: "Use starter" }).first().click();
  await expect(page.getByLabel("Event title")).toBeVisible();
  expect(requests).toEqual([]);
  const spare = await page.context().newPage();
  try {
    await spare.goto("/app/settings");
    await page.goto("/app/settings");
    const saved = spare.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const listener = (event: StorageEvent) => {
            if (event.key?.startsWith("ruckus-audio-v1:host:")) {
              window.removeEventListener("storage", listener);
              resolve();
            }
          };
          window.addEventListener("storage", listener);
        }),
    );
    await page.getByLabel("Music enabled", { exact: true }).uncheck();
    await saved;
    await spare.bringToFront();
    await spare.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(
      spare.getByLabel("Music enabled", { exact: true }),
    ).toBeChecked();
    await spare.reload();
    await expect(
      spare.getByLabel("Music enabled", { exact: true }),
    ).not.toBeChecked();
    expect(requests).toEqual([]);
  } finally {
    await spare.close();
  }
});

test("unsupported Web Audio degrades to a quiet status while host gameplay continues", async ({
  page,
}) => {
  test.setTimeout(45000);
  const { socket, identity } = await seededRoom(page);
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, "AudioContext", {
        value: class {
          constructor() {
            throw new Error("Audio unavailable in this test");
          }
        },
      });
    });
    await page.goto(`/room/${identity.code}/host`);
    await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
    await expect(
      page.getByRole("heading", { name: "Hotwire", exact: true }),
    ).toBeVisible();
    await expect(audio(page)).toHaveAttribute("data-audio-state", "error");
    await page.getByRole("button", { name: "We’re ready" }).click();
    await expect(page.locator(".host-round")).toBeVisible();
    await page.getByRole("button", { name: "Close round" }).click();
    await expect(
      page.getByRole("button", { name: "Next →", exact: true }),
    ).toBeVisible();
  } finally {
    socket.disconnect();
  }
});

test("missing game assets fall back to the neutral Studio bed without interrupting the round", async ({
  page,
}) => {
  const { socket, identity } = await seededRoom(page);
  const failed: string[] = [];
  await page.route("**/audio/hotwire.*", async (route) => {
    failed.push(route.request().url());
    await route.fulfill({ status: 404, body: "Unavailable" });
  });
  try {
    await page.goto(`/room/${identity.code}/host`);
    await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
    await page.getByRole("button", { name: "We’re ready" }).click();
    await expect(page.locator(".host-round")).toBeVisible();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "studio");
    expect(failed.some((url) => url.endsWith(".ogg"))).toBe(true);
    expect(failed.some((url) => url.endsWith(".mp3"))).toBe(true);
    await page.getByRole("button", { name: "Close round" }).click();
    await expect(page.locator(".round-reveal")).toBeVisible();
    await expect(audio(page)).toHaveAttribute("data-audio-track", "results");
  } finally {
    socket.disconnect();
  }
});

test("audio controls retain independent in-memory settings when preference storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("ruckus-audio-v1:"))
        throw new DOMException("Storage blocked", "QuotaExceededError");
      set.call(this, key, value);
    };
  });
  await page.goto("/app/settings");
  await page.getByLabel("Music enabled", { exact: true }).uncheck();
  await page.getByLabel("Effects enabled", { exact: true }).uncheck();
  await expect(
    page.getByLabel("Music enabled", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Effects enabled", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Effects enabled", { exact: true }).check();
  await expect(
    page.getByLabel("Music enabled", { exact: true }),
  ).not.toBeChecked();
});
