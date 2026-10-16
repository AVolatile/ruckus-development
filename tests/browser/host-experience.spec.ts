import { test, expect, appOrigin } from "./fixtures";
import { newBoard } from "../../shared/boards";
import { emptyPack } from "../../shared/content-packs";
import AxeBuilder from "@axe-core/playwright";
import { eventTemplateSpecs } from "../../shared/events";
import { gameById } from "../../shared/catalog";

const widths = [320, 390, 768, 1024, 1280, 1440, 1728];

test("starter lineups describe the real event created from a keyboard action", async ({
  page,
}) => {
  await page.goto("/app/events");
  for (const starter of eventTemplateSpecs) {
    const lineup = page.getByRole("list", {
      name: `${starter.name} lineup`,
      exact: true,
    });
    await expect(lineup.getByRole("listitem")).toHaveText(
      starter.games.map(
        (slug, index) =>
          `${String(index + 1).padStart(2, "0")}${gameById(slug).name}`,
      ),
    );
  }
  const starter = page.locator(".event-starter").filter({
    has: page.getByRole("heading", { name: "Team Warmup", exact: true }),
  });
  const useStarter = starter.getByRole("button", { name: "Use starter" });
  await useStarter.focus();
  await expect(useStarter).toBeFocused();
  await useStarter.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Team Warmup", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".event-playlist h3")).toHaveText([
    "Room Temperature",
    "Hotwire",
  ]);
  const pathname = new URL(page.url()).pathname;
  const record = await (
    await page.request.get(
      `/api/v1/workspaces/${pathname.split("/")[3]}/events/${pathname.split("/").at(-1)}`,
    )
  ).json();
  expect(
    record.definition.playlist.map(
      (item: { gameSlug: string }) => item.gameSlug,
    ),
  ).toEqual(["room-temperature", "hotwire"]);
});

test("local import stays quiet through navigation, survives dismissal and remains recoverable", async ({
  page,
}) => {
  test.setTimeout(90000);
  const board = newBoard();
  board.title = "A local original worth keeping";
  await page.goto("/app");
  await page.evaluate(
    (board) =>
      localStorage.setItem("ruckus-studio-v1", JSON.stringify([board])),
    board,
  );
  await page.reload();
  const review = page.getByRole("button", {
    name: "Review local boards →",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import local boards", exact: true }),
  ).toBeHidden();
  await review.click();
  await expect(page.locator("#local-import-details")).toBeVisible();
  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await expect(page.locator("#local-import-details")).toBeHidden();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["Originals", "Studio", "Library", "Events"]) {
      if (width <= 1100)
        await page.getByRole("button", { name: "Menu", exact: false }).click();
      const link = page
        .getByRole("navigation", { name: "Host navigation", exact: true })
        .getByRole("link", { name: route, exact: true });
      await link.click();
      await expect(
        page
          .locator("#host-navigation a")
          .filter({ hasText: new RegExp(`^${route}$`) }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page
          .locator("main h1")
          .evaluate((el) => el.getBoundingClientRect().top),
      ).toBeLessThan(450);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBe(0);
      await expect(page.locator("#local-import-details")).toBeHidden();
    }
  }
  await review.click();
  await expect(
    page.getByRole("combobox", { name: "Import destination" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.reload();
  await expect(review).toBeHidden();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(review).toBeVisible();
  await review.click();
  const workspaceTrigger = page.locator(".workspace-switcher > button");
  await workspaceTrigger.click();
  await expect(
    page.getByRole("navigation", { name: "Choose workspace" }),
  ).toBeVisible();
  await workspaceTrigger.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Choose workspace" }),
  ).toBeHidden();
  await expect(workspaceTrigger).toBeFocused();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export local backup" }).click();
  expect((await download).suggestedFilename()).toBe("ruckus-local-backup.json");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ruckus-studio-v1")!)[0].id,
    ),
  ).toBe(board.id);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("pack shelf keeps whole words and usable filters at all working widths", async ({
  page,
}) => {
  await page.goto("/app/content-packs");
  const card = page
    .locator(".pack-card")
    .filter({ hasText: "General Knowledge" });
  await expect(card).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const result = await card.locator("h2").evaluate((el) => {
      const text = el.firstChild!;
      const value = text.textContent!;
      const lines = [...value].map((_, i) => {
        const range = document.createRange();
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        return Math.round(range.getBoundingClientRect().top);
      });
      return {
        general: lines.slice(0, 7),
        knowledge: lines.slice(8),
        size: parseFloat(getComputedStyle(el).fontSize),
      };
    });
    expect(new Set(result.general).size).toBe(1);
    expect(new Set(result.knowledge).size).toBe(1);
    expect(result.size).toBeLessThanOrEqual(28);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    const select = page.getByRole("combobox", { name: "Game", exact: true });
    expect(
      await select.evaluate((el) =>
        parseFloat(getComputedStyle(el).paddingRight),
      ),
    ).toBeGreaterThanOrEqual(36);
  }
  await page
    .getByRole("combobox", { name: "Game", exact: true })
    .selectOption("hotwire");
  await expect(page.locator(".pack-card")).toHaveCount(2);
  await page.route("**/api/v1/workspaces/*/content-packs?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "UNAVAILABLE",
          message: "The shelf could not be loaded. Try again.",
        },
      }),
    }),
  );
  // A failed filter must not present the preceding successful filter's rows.
  await page
    .getByRole("combobox", { name: "Game", exact: true })
    .selectOption("sellout");
  await expect(page.getByRole("alert")).toContainText(
    "The shelf could not be loaded",
  );
  await expect(page.locator(".pack-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Try loading packs again" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Game", exact: true })
    .selectOption("hotwire");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "The shelf could not be loaded",
  );
  await expect(
    page.getByRole("heading", { name: "No packs in this mix yet." }),
  ).toBeHidden();
  await expect(page.getByText("0 packs shown", { exact: true })).toBeHidden();
  await page.unroute("**/api/v1/workspaces/*/content-packs?*");
  await page.getByRole("button", { name: "Try loading packs again" }).click();
  await expect(page.locator(".pack-card")).toHaveCount(2);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("pack status waits for acknowledgement and retains error and conflict feedback", async ({
  page,
}) => {
  const wid = (await (await page.request.get("/api/v1/workspaces")).json())
    .items[0].id;
  const base = `/api/v1/workspaces/${wid}/content-packs`;
  const pack = await (
    await page.request.post(base, {
      headers: {
        Origin: appOrigin,
      },
      data: { document: emptyPack("hotwire", "Status rehearsal") },
    })
  ).json();
  await page.goto(`/app/w/${wid}/content-packs/${pack.id}/edit`);
  const status = page.locator(".host-page-meta .host-status");
  await expect(status).toHaveAttribute("data-state", "saved");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const requestStarted = new Promise<void>((r) => (started = r));
  await page.route(`**${base}/${pack.id}`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    started();
    await gate;
    await route.continue();
  });
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("An acknowledged save");
  await requestStarted;
  await expect(status).toHaveAttribute("data-state", "saving");
  await expect(status).not.toContainText("Saved");
  release();
  await expect(status).toHaveAttribute("data-state", "saved");
  await page.unroute(`**${base}/${pack.id}`);
  await page.route(`**${base}/${pack.id}`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONTENT_CONFLICT",
              message: "Another editor saved first.",
            },
          }),
        })
      : route.continue(),
  );
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Keep these edits");
  await expect(status).toHaveAttribute("data-state", "conflict");
  await expect(
    page.getByRole("button", { name: "Export edits" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Keep these edits");
  await page.unroute(`**${base}/${pack.id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Load latest", exact: true }).click();
  await expect(status).toHaveAttribute("data-state", "saved");
  await page.route(`**${base}/${pack.id}`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "UNAVAILABLE",
              message:
                "Saving is temporarily unavailable. Your edits are still here.",
            },
          }),
        })
      : route.continue(),
  );
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Retain this offline edit");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Retain this offline edit");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await status
      .locator(".host-status-mark")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await expect(
    page.getByRole("link", { name: "← Pack details" }),
  ).toHaveAttribute("href", new RegExp(pack.id));
});
