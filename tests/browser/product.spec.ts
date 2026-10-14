import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import { DEFAULT_SETTINGS, GAMES } from "../../shared/catalog";
import type { Reply } from "../../shared/types";
test("homepage interaction, production routes, responsive layouts, and console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Clock out of ordinary." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "A Pigeon" }).click();
  await expect(
    page.getByText("Excellent. Upper management material."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase-0/homepage-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of [
    "/app/originals",
    "/product",
    "/teams",
    "/events",
    "/pricing",
    "/resources",
    "/login",
    "/signup",
    "/app",
    "/app/library",
    "/app/events",
    "/app/analytics",
    "/app/workspace",
    "/app/settings",
    ...GAMES.map((g) => `/app/originals/${g.id}`),
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("real host lobby + phone join, avatar, submission, vote, reconnect, keyboard and end", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/host?game=sellout");
  await page.getByLabel("Rounds per game").selectOption("1");
  await page.getByText("Keep the party moving", { exact: true }).click();
  await page.getByRole("button", { name: "Open the room" }).click();
  await expect(
    page.getByRole("heading", { name: "Look who showed up." }),
  ).toBeVisible();
  const code = (await page.locator(".host-code b").textContent())!;
  const joinUrl = new URL(
    (await page.locator(".join-url").getAttribute("href"))!,
  );
  expect(joinUrl.pathname).toBe("/join");
  expect(joinUrl.searchParams.get("room")).toBe(code);
  await expect(
    page.getByRole("img", { name: `Scan to join room ${code}` }),
  ).toHaveAttribute("src", /^data:image\/png/);

  await page
    .getByRole("button", { name: "+ 8 demo players", exact: true })
    .click();
  await expect(page.locator(".lobby-player")).toHaveCount(8);
  await page.reload();
  await expect(page.locator(".lobby-player")).toHaveCount(8);
  await expect(page.locator(".host-code b")).toHaveText(code);
  for (const [width, height] of [
    [1024, 768],
    [1280, 720],
    [1440, 810],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.screenshot({
    path: "test-results/phase-0/host-lobby-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    phone = await context.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(`/join?room=${code}`);
  await phone.getByLabel("What should we call you?").fill("Anthony");
  await phone
    .getByRole("button", { name: "Choose Bandit", exact: true })
    .click();
  await phone.screenshot({
    path: "test-results/phase-0/mobile-join-390.png",
    fullPage: true,
    animations: "disabled",
  });
  await phone.getByRole("button", { name: "I’m in. Let’s go." }).click();
  await expect(
    phone.getByRole("heading", { name: "Anthony, you’re in." }),
  ).toBeVisible();
  await expect(page.locator(".lobby-player")).toHaveCount(9);
  await phone.reload();
  await expect(
    phone.getByRole("heading", { name: "Anthony, you’re in." }),
  ).toBeVisible();
  await phone.screenshot({
    path: "test-results/phase-0/mobile-lobby-390.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
  await page.getByRole("button", { name: "We’re ready" }).click();
  await expect(phone.getByLabel("Product name")).toBeVisible();
  await phone.getByLabel("Product name").fill("Staple Society");
  await phone
    .getByLabel("Your one-line pitch")
    .fill("Hold it together, expensively.");
  await phone.screenshot({
    path: "test-results/phase-0/mobile-sellout-390.png",
    fullPage: true,
    animations: "disabled",
  });
  await phone.getByRole("button", { name: "Put it on the big screen" }).click();
  await expect(
    phone.getByRole("heading", { name: "Locked. Loaded. Lovely." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase-0/sellout-host-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await expect(page.locator(".round-response")).toContainText("9 answers in", {
    timeout: 40000,
  });
  await page.getByRole("button", { name: "Close round" }).click();
  await expect(
    phone.getByRole("heading", { name: "Who gets the spotlight?" }),
  ).toBeVisible();
  await phone.locator(".player-vote:enabled").first().click();
  await expect(
    phone.getByRole("heading", { name: "Your vote is in." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reveal votes" }).click();
  await expect(
    page.getByRole("heading", { name: "The room has spoken." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase-0/sellout-reveal-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("OFFICIALLY THE PERSON TO BEAT.")).toBeVisible();
  await page.screenshot({
    path: "test-results/phase-0/winner-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Host controls H" }).click();
  await page.getByRole("button", { name: "End this room" }).click();
  await page.getByRole("button", { name: "End room", exact: true }).click();
  await expect(
    phone.getByRole("heading", {
      name: "The room’s closed. The stories aren’t.",
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
test("drawing controller works with keyboard and at four phone sizes", async ({
  page,
  browser,
}) => {
  const host = io("http://localhost:4310", { transports: ["websocket"] });
  await new Promise<void>((r) => host.on("connect", r));
  const create = await new Promise<Reply>((r) =>
    host.emit(
      "room:create",
      {
        settings: {
          ...DEFAULT_SETTINGS,
          playlist: ["scribble-shift"],
          rounds: 1,
          autoAdvance: false,
          pace: "relaxed",
        },
        demo: true,
      },
      r,
    ),
  );
  const code = create.identity!.code;
  await page.goto(`/join?room=${code}`);
  await page.getByLabel("What should we call you?").fill("Keyboard Artist");
  await page.getByRole("button", { name: "I’m in. Let’s go." }).click();
  await expect(
    page.getByRole("heading", { name: "Keyboard Artist, you’re in." }),
  ).toBeVisible();
  await new Promise<Reply>((r) =>
    host.emit("host:action", { action: "start" }, r),
  );
  await new Promise<Reply>((r) =>
    host.emit("host:action", { action: "next" }, r),
  );
  await expect(page.locator(".drawing-canvas")).toBeVisible();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".drawing-canvas").focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.screenshot({
    path: "test-results/phase-0/mobile-drawing-430.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Send my masterpiece" }).click();
  await expect(
    page.getByRole("heading", { name: "A masterpiece. Probably." }),
  ).toBeVisible();
  await new Promise<Reply>((r) =>
    host.emit("host:action", { action: "end" }, r),
  );
  host.disconnect();
  void browser;
});
