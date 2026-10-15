import { test, expect, appOrigin } from "./fixtures";
import { newBoard } from "../../shared/boards";
import { defaultBrandConfig } from "../../shared/brand";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
async function clean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
async function widths(page: Page, label: string) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${label} at ${width}`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
test("build, preview and launch an immutable branded three-segment event with a guest who joins once", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const spaces = await (await page.request.get("/api/v1/workspaces")).json(),
    wid = spaces.items[0].id,
    base = `/api/v1/workspaces/${wid}`;
  const source = newBoard();
  source.title = "Holiday Studio questions";
  source.questions[0] = {
    ...source.questions[0],
    prompt: "The first holiday answer?",
    answers: ["First", "Second"],
    correctAnswer: 0,
    timer: 15,
  };
  const boardResponse = await page.request.post(base + "/boards", {
    headers: { Origin: appOrigin },
    data: { board: source },
  });
  expect(boardResponse.ok()).toBe(true);
  const board = await boardResponse.json();
  const image = await sharp({
    create: { width: 20, height: 20, channels: 4, background: "#2548f4" },
  })
    .png()
    .toBuffer();
  const asset = await (
    await page.request.post(base + "/brand-assets?kind=logo", {
      headers: { Origin: appOrigin, "Content-Type": "image/png" },
      data: image,
    })
  ).json();
  const brand = await (
    await page.request.post(base + "/brand-kits", {
      headers: { Origin: appOrigin },
      data: {
        name: "Holiday crew",
        config: {
          ...defaultBrandConfig,
          organizationDisplayName: "Holiday crew",
          logoAssetId: asset.id,
        },
      },
    })
  ).json();
  await page.goto(`/app/w/${wid}/events`);
  await expect(
    page.getByRole("heading", { name: "Make a night of it." }),
  ).toBeVisible();
  await widths(page, "Event list");
  await clean(page);
  await page.getByRole("link", { name: "Create an event" }).click();
  await page.getByLabel("Event title").fill("Holiday Party 2027");
  await page.getByRole("button", { name: "Build this event" }).click();
  await expect(
    page.getByRole("heading", { name: "Holiday Party 2027", exact: true }),
  ).toBeVisible();
  const eventURL = page.url(),
    eid = eventURL.split("/").at(-1)!;
  await page
    .getByRole("combobox", { name: "Brand Kit", exact: true })
    .selectOption(brand.id);
  await page
    .getByLabel("Add an Original", { exact: true })
    .selectOption("room-temperature");
  await page
    .getByLabel("Add a Studio board", { exact: true })
    .selectOption(board.board.id);
  await page
    .getByLabel("Add an Original", { exact: true })
    .selectOption("caption-this");
  for (const summary of await page
    .locator(".event-segment-options summary")
    .all())
    await summary.click();
  for (const rounds of await page
    .getByRole("combobox", { name: "Rounds", exact: true })
    .all())
    await rounds.selectOption("1");
  for (const pace of await page
    .getByRole("combobox", { name: "Pace", exact: true })
    .all())
    await pace.selectOption("quick");
  await page
    .getByRole("button", {
      name: "Move Holiday Studio questions up",
      exact: true,
    })
    .click();
  await expect(page.locator(".event-playlist>li").first()).toContainText(
    "Holiday Studio questions",
  );
  await page
    .getByRole("button", {
      name: "Move Holiday Studio questions down",
      exact: true,
    })
    .click();
  await expect(page.locator(".event-playlist>li").first()).toContainText(
    "Room Temperature",
  );
  await expect(page.locator(".event-editor-header [role=status]")).toHaveText(
    "Saved to workspace",
  );
  for (const summary of await page
    .locator(".event-segment-options summary")
    .all())
    await summary.click();
  await widths(page, "Event builder");
  await clean(page);
  await mkdir("test-results/phase-3", { recursive: true });
  await page.screenshot({
    path: "test-results/phase-3/builder-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/phase-3/builder-phone.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByLabel("Event title")).toHaveValue(
    "Holiday Party 2027",
  );
  const soundtrackRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/audio/"))
      soundtrackRequests.push(r.url());
  });
  const sockets: string[] = [];
  page.on("websocket", (s) => sockets.push(s.url()));
  await page.getByRole("button", { name: "Preview", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for the room." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Holiday Studio questions",
      exact: true,
    }),
  ).toBeVisible();
  expect(sockets).toHaveLength(0);
  expect(soundtrackRequests).toHaveLength(0);
  await widths(page, "Event preview");
  await clean(page);
  await page.getByRole("button", { name: "Launch event" }).click();
  await expect(
    page.getByRole("button", { name: "Start event", exact: false }),
  ).toBeVisible();
  const code = page.url().split("/").at(-2)!;
  await widths(page, "Host event lobby");
  await clean(page);
  await page.screenshot({
    path: "test-results/phase-3/lobby-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add 4 demo players" }).click();
  await expect(page.locator("[data-audio-state]")).toHaveAttribute(
    "data-audio-track",
    "lobby",
  );
  const guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await guestContext.newPage();
  try {
    await guest.goto(`${appOrigin}/join?room=${code}`);
    await guest.getByLabel("What should we call you?").fill("Holiday guest");
    await guest.getByRole("button", { name: "I’m in. Let’s go." }).click();
    await expect(guest).toHaveURL(new RegExp(`/room/${code}/play$`));
    await clean(guest);
    const identity = await guest.evaluate(() =>
      sessionStorage.getItem("ruckus-session"),
    );
    const guestAsset = await guest.request.get(
      `/api/v1/event-assets/${asset.id}`,
    );
    expect(guestAsset.status()).toBe(404);
    expect(
      (await guest.request.get(base + `/brand-assets/${asset.id}`)).status(),
    ).toBe(401);
    // Update sources after launch; the live Studio source and Brand remain pinned.
    await page.request.put(base + `/boards/${board.board.id}`, {
      headers: { Origin: appOrigin },
      data: {
        board: {
          ...board.board,
          title: "Changed after launch",
          questions: [
            {
              ...board.board.questions[0],
              prompt: "Changed private source prompt",
            },
          ],
        },
        baseRevisionId: board.revisionId,
      },
    });
    await page.request.put(base + `/brand-kits/${brand.id}`, {
      headers: { Origin: appOrigin },
      data: {
        name: "Changed Brand",
        config: {
          ...brand.config,
          organizationDisplayName: "Changed after launch",
        },
        baseRevisionId: brand.revisionId,
      },
    });
    await page
      .getByRole("button", { name: "Start event", exact: false })
      .click();
    await page.getByRole("button", { name: "Introduce first game" }).click();
    for (let index = 0; index < 3; index++) {
      await page
        .getByRole("button", { name: "Start game", exact: false })
        .click();
      await page.getByRole("button", { name: "We’re ready" }).click();
      await expect(page.locator(".host-round")).toBeVisible();
      await expect(page.locator("[data-audio-state]")).toHaveAttribute(
        "data-audio-track",
        ["room-temperature", "studio", "caption-this"][index],
      );
      if (index === 1) {
        await expect(
          guest.getByRole("heading", {
            name: "The first holiday answer?",
            exact: true,
          }),
        ).toBeVisible();
        await guest.reload();
        await expect(
          guest.getByRole("heading", {
            name: "The first holiday answer?",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await guest.evaluate(() => sessionStorage.getItem("ruckus-session")),
        ).toBe(identity);
      }
      if (index < 2) {
        await guest.locator(".player-answer").first().click();
        await page.getByRole("button", { name: "Close round" }).click();
      } else {
        await guest
          .getByLabel("Your caption")
          .fill("A festive meeting with excellent snacks");
        await guest
          .getByRole("button", { name: "Put it on the big screen" })
          .click();
        await expect
          .poll(
            async () => {
              const text = await page.locator(".round-response").innerText();
              return Number(text.match(/(\d+) answers in/)?.[1] || 0);
            },
            { timeout: 26000 },
          )
          .toBeGreaterThanOrEqual(2);
        await page.getByRole("button", { name: "Close round" }).click();
        await expect(
          page.getByRole("heading", { name: "Pick your favorite." }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Reveal votes" }).click();
      }
      await page.getByRole("button", { name: "Next →", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: /that’s a wrap/ }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: index < 2 ? "Continue event" : "Show event finale",
        })
        .click();
      if (index < 2) {
        await expect(
          page.getByRole("heading", { name: "A little room to breathe." }),
        ).toBeVisible();
        if (index === 0) {
          await expect(page.locator("[data-audio-state]")).toHaveAttribute(
            "data-audio-track",
            "intermission",
          );
          await page.reload();
          await page
            .getByRole("button", { name: "Enable sound", exact: true })
            .click();
          await expect(page.locator("[data-audio-state]")).toHaveAttribute(
            "data-audio-track",
            "intermission",
          );
          await expect(page.locator("[data-audio-state]")).toHaveAttribute(
            "data-audio-shots",
            "0",
          );
          await widths(page, "Host intermission");
          await widths(guest, "Guest intermission");
          await clean(guest);
          await clean(page);
        }
        await page.getByRole("button", { name: "Introduce next game" }).click();
      }
    }
    await expect(
      guest.getByRole("heading", {
        name: "That was a good Ruckus.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      guest.getByRole("region", { name: "Event leaderboard" }),
    ).toContainText("Holiday guest");
    await widths(guest, "Guest event final");
    await widths(page, "Host event final");
    await clean(guest);
    await clean(page);
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.screenshot({
      path: "test-results/phase-3/final-phone.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Back to workspace events" }).click();
    await expect(
      page.getByRole("heading", { name: "Make a night of it." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(eid).toMatch(/^[a-f0-9-]{36}$/);
  } finally {
    await guestContext.close();
  }
});

test("event autosave keeps in-flight edits, handles stale conflicts and exports without losing drafts", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const wid = (await (await page.request.get("/api/v1/workspaces")).json())
    .items[0].id;
  await page.goto(`/app/w/${wid}/events`);
  await page.getByRole("button", { name: "Use starter" }).first().click();
  await expect(page.getByLabel("Event title")).toBeVisible();
  const eventURL = page.url();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let held = false;
  await page.route("**/events/*", async (route) => {
    if (route.request().method() === "PUT" && !held) {
      held = true;
      await gate;
    }
    await route.continue();
  });
  await page.getByLabel("Event title").fill("First in flight");
  await expect.poll(() => held).toBe(true);
  await page.getByLabel("Event title").fill("Latest edit survives");
  release!();
  await expect(page.locator(".event-editor-header [role=status]")).toHaveText(
    "Saved to workspace",
  );
  await page.reload();
  await expect(page.getByLabel("Event title")).toHaveValue(
    "Latest edit survives",
  );
  const state = await page.context().storageState();
  const secondContext = await browser.newContext({ storageState: state }),
    second = await secondContext.newPage();
  try {
    await second.goto(eventURL);
    await expect(second.getByLabel("Event title")).toHaveValue(
      "Latest edit survives",
    );
    await page.getByLabel("Event title").fill("Newer cloud title");
    await expect(page.locator(".event-editor-header [role=status]")).toHaveText(
      "Saved to workspace",
    );
    await second.getByLabel("Event title").fill("My conflicting draft");
    await expect(second.getByRole("alert")).toContainText("newer event");
    await expect(second.getByLabel("Event title")).toHaveValue(
      "My conflicting draft",
    );
    const download = second.waitForEvent("download");
    await second.getByRole("button", { name: "Export my edits" }).click();
    expect((await download).suggestedFilename()).toBe("ruckus-event.json");
    second.once("dialog", (dialog) => dialog.accept());
    await second
      .getByRole("button", { name: "Load latest cloud event" })
      .click();
    await expect(second.getByLabel("Event title")).toHaveValue(
      "Newer cloud title",
    );
  } finally {
    await secondContext.close();
  }
});
