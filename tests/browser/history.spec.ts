import { test, expect, appOrigin } from "./fixtures";
import { playedSession, restoreStage } from "./history-support";
import AxeBuilder from "@axe-core/playwright";
const widths = [320, 390, 768, 1024, 1280, 1440, 1728];
async function accessible(page: import("@playwright/test").Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
test("History and Analytics start honestly empty, with compact filters and no game connection", async ({
  page,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (s) => {
    if (s.url().includes("/socket.io")) sockets.push(s.url());
  });
  await page.goto("/app/history");
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
  await page.locator(".history-dates summary").click();
  await page.getByLabel("From (UTC)", { exact: true }).fill("2026-10-16");
  await page.getByLabel("Through (UTC)", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Through (UTC)", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "on or after the start date",
  );
  await page.getByLabel("Through (UTC)", { exact: true }).fill("2026-10-16");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/from=2026-10-16/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await accessible(page);
  expect(sockets).toEqual([]);
  await page.goto("/app/analytics?range=7#kept");
  await expect(page).toHaveURL(/\/history\/analytics\?range=7#kept$/);
});
test("actual Original completion survives host refresh, opens a matching recap, filters and exports safely", async ({
  page,
}) => {
  const played = await playedSession(page, "original", "scribble-shift");
  await restoreStage(page, played.identity);
  await expect(
    page.getByRole("link", { name: "Open saved recap" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Open saved recap" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Scribble Shift",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  const standings = page.getByRole("list", { name: "Final leaderboard" });
  for (const p of played.state.players) {
    await expect(standings.getByText(p.name, { exact: true })).toBeVisible();
    expect(
      played.recap.participants.find((r: { name: string }) => r.name === p.name)
        .finalScore,
    ).toBe(p.score);
  }
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export recap CSV" }).click();
  expect((await csv).suggestedFilename()).toMatch(/recap.csv$/);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await accessible(page);
  await page.getByRole("link", { name: "All sessions" }).click();
  await expect(
    page.getByRole("link", { name: "Open recap: Scribble Shift" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "What", exact: true })
    .selectOption("event");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("heading", { name: "No sessions in this lineup." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("link", { name: "Open recap: Scribble Shift" }),
  ).toBeVisible();
});
test("mixed Event and Studio recaps retain source versions, participation and real SQL analytics", async ({
  page,
}) => {
  test.setTimeout(120000);
  const event = await playedSession(page, "event"),
    poll = await playedSession(page, "poll");
  await restoreStage(page, event.identity);
  await expect(
    page.getByRole("link", { name: "Open saved recap" }),
  ).toBeVisible();
  await expect(page.locator(".event-leaderboard")).toHaveCount(0);
  await page.getByRole("link", { name: "Open saved recap" }).click();
  await expect(
    page.getByRole("heading", { name: "A little of everything", exact: true }),
  ).toBeVisible();
  expect(event.recap.segments).toHaveLength(3);
  await expect(
    page.locator(".recap-segment").filter({ hasText: "Room Temperature" }),
  ).toContainText("majority responses");
  const leaders = page.locator(
    '.recap-standings li[data-rank="1"] .recap-rank',
  );
  await expect(leaders).toHaveCount(2);
  for (const leader of await leaders.all())
    await expect(leader).toHaveCSS("background-color", "rgb(246, 237, 81)");
  expect(event.recap.source.eventRevisionId).toBe(event.eventRevisionId);
  await expect(
    page.getByRole("heading", { name: "Inside knowledge", exact: true }),
  ).toBeVisible();
  await accessible(page);
  await page.getByRole("button", { name: "Open current source" }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${event.eventId}/preview$`));
  await page.request.post(event.base + `/events/${event.eventId}/archive`, {
    headers: { Origin: appOrigin },
  });
  await page.goto(`/app/w/${event.wid}/history/${event.recap.id}`);
  await page.getByRole("button", { name: "Open current source" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "current source isn’t available",
  );
  await page.goto(`/app/w/${poll.wid}/history/${poll.recap.id}`);
  await expect(
    page.getByRole("heading", { name: "Every opinion counted." }),
  ).toBeVisible();
  expect(
    poll.recap.participants.every(
      (p: { finalRank: number | null }) => p.finalRank === null,
    ),
  ).toBe(true);
  await accessible(page);
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page.locator(".analytics-lead > strong")).toHaveText("2");
  await expect(page.locator(".analytics-lead")).toContainText(
    "4 participant attendances",
  );
  await page
    .getByRole("combobox", { name: "When", exact: true })
    .selectOption("7");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/range=7/);
  await expect(page.locator(".analytics-lead > strong")).toHaveText("2");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  for (const title of await page.locator(".analytics-game-lineup h3").all()) {
    const split = await title.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const errors: string[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode,
          text = node.textContent ?? "";
        for (const word of text.matchAll(/\S+/g)) {
          const rows = new Set<number>();
          for (let i = word.index!; i < word.index! + word[0].length; i++) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            rows.add(Math.round(range.getBoundingClientRect().top));
          }
          if (rows.size > 1) errors.push(word[0]);
        }
      }
      return errors;
    });
    expect(split).toEqual([]);
  }
  await accessible(page);
  const fromDay = event.recap.startedAt.slice(0, 10),
    toDay = poll.recap.startedAt.slice(0, 10);
  await page.locator(".history-dates summary").click();
  await page.getByLabel("From (UTC)", { exact: true }).fill(fromDay);
  await page.getByLabel("Through (UTC)", { exact: true }).fill(toDay);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".analytics-lead > strong")).toHaveText("2");
  await page
    .locator(".analytics-game-lineup li")
    .filter({ hasText: "Caption This" })
    .getByRole("link", { name: "See sessions" })
    .click();
  await expect(page).toHaveURL(/game=caption-this/);
  expect(new URL(page.url()).searchParams.get("from")).toBe(fromDay);
  expect(new URL(page.url()).searchParams.get("to")).toBe(toDay);
  await expect(page.locator(".history-entry")).toHaveCount(1);
});
test("failed history fetch never becomes an empty shelf and Retry restores real data", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/v1/workspaces/*/sessions?*", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "UNAVAILABLE",
              message: "History is temporarily unavailable. Try again.",
            },
          }),
        })
      : route.continue(),
  );
  await page.goto("/app/history");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
});
