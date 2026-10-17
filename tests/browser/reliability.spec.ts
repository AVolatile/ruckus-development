import { test, expect, appOrigin } from "./fixtures";
import { playedSession } from "./history-support";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
test("recap deletion needs confirmation, retains failures, updates Analytics and preserves source content", async ({
  page,
}) => {
  const played = await playedSession(page, "studio");
  const base = `/api/v1/workspaces/${played.recap.workspaceId}`,
    path = `${base}/sessions/${played.recap.id}`;
  await page.goto(
    `/app/w/${played.recap.workspaceId}/history/${played.recap.id}`,
  );
  await page.getByRole("button", { name: "Delete recap", exact: true }).click();
  const confirm = page.getByRole("textbox", { name: "Type DELETE to confirm" });
  await expect(confirm).toBeFocused();
  const destructive = page.getByRole("button", {
    name: "Permanently delete recap",
  });
  let deleteRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && request.url().endsWith(path))
      deleteRequests++;
  });
  for (const value of [
    "DELETE",
    "delete",
    "Delete",
    "dElEtE",
    " DELETE ",
    "delete   ",
  ]) {
    await confirm.fill(value);
    await expect(destructive).toBeEnabled();
  }
  for (const value of ["delet", "delete recap", "yes", "confirm", "", "   "]) {
    await confirm.fill(value);
    await expect(destructive).toBeDisabled();
    await confirm.press("Enter");
  }
  expect(deleteRequests).toBe(0);
  expect((await page.request.get(path)).ok()).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete recap", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Delete recap", exact: true }).click();
  await confirm.fill("DELETE");
  await mkdir(".local/visual-qa/phase-6-acceptance", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await confirm.fill("delet");
    await expect(destructive).toBeDisabled();
    expect(
      await destructive.evaluate((el) => Number(getComputedStyle(el).opacity)),
    ).toBeLessThan(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.locator(".recap-deletion").screenshot({
      path: `.local/visual-qa/phase-6-acceptance/delete-disabled-${width}.png`,
    });
    await confirm.fill("delete");
    await expect(destructive).toBeEnabled();
    expect(
      await destructive.evaluate((el) => ({
        opacity: getComputedStyle(el).opacity,
        background: getComputedStyle(el).backgroundColor,
      })),
    ).toEqual({ opacity: "1", background: "rgb(173, 48, 39)" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.locator(".recap-deletion").screenshot({
      path: `.local/visual-qa/phase-6-acceptance/delete-enabled-${width}.png`,
    });
  }
  await page.route("**/sessions/" + played.recap.id, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 503,
          json: {
            error: {
              code: "TEMPORARILY_UNAVAILABLE",
              message: "Couldn’t reach your saved work. Try again shortly.",
            },
          },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Permanently delete recap" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t reach");
  await expect(confirm).toHaveValue("delete");
  expect((await page.request.get(path)).ok()).toBe(true);
  await page.unroute("**/sessions/" + played.recap.id);
  await confirm.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/history$`));
  await expect(
    page.getByRole("status").filter({ hasText: "Recap deleted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
  expect((await page.request.get(path)).status()).toBe(404);
  expect(
    (
      await page.request.get(`${base}/boards/${played.recap.source.boardId}`)
    ).ok(),
  ).toBe(true);
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
  const noConfirmation = await page.request.delete(path, {
    headers: { Origin: appOrigin },
    data: {},
  });
  expect(noConfirmation.status()).toBe(400);
});
test("pending recap gives a truthful retry instead of a false empty state", async ({
  page,
}) => {
  const played = await playedSession(page, "original", "room-temperature"),
    route = "**/sessions/" + played.recap.id;
  await page.route(route, (r) =>
    r.fulfill({
      status: 409,
      json: {
        error: {
          code: "RECAP_PENDING",
          message: "Your recap is still saving. Try again in a moment.",
        },
      },
    }),
  );
  await page.goto(
    `/app/w/${played.recap.workspaceId}/history/${played.recap.id}`,
  );
  await expect(page.getByRole("alert")).toContainText("still saving");
  await expect(
    page.getByRole("button", { name: "Delete recap", exact: true }),
  ).toHaveCount(0);
  await page.unroute(route);
  await page.getByRole("button", { name: "Try again", exact: false }).click();
  await expect(
    page.getByRole("heading", {
      name: "Room Temperature",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
});
test("final acceptance journey logs in, plays an Original with guests, reads actual Analytics and deletes in lowercase", async ({
  page,
}) => {
  const identity = await (await page.request.get("/api/v1/me")).json();
  expect(
    (
      await page.request.post("/api/auth/sign-out", {
        headers: { Origin: appOrigin },
        data: {},
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(identity.user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("A browser test passphrase!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app/);
  const played = await playedSession(page, "original", "room-temperature");
  await page.goto(`/app/w/${played.wid}/history`);
  await page
    .getByRole("link", { name: "Open recap: Room Temperature" })
    .click();
  await expect(
    page.getByRole("list", { name: "Final leaderboard" }),
  ).toContainText("Maya guest");
  await page.getByRole("link", { name: "All sessions" }).click();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page.locator(".analytics-lead > strong")).toHaveText("1");
  expect(
    (await (await page.request.get(played.base + "/analytics/summary")).json())
      .sessions,
  ).toBe(1);
  await page.goto(`/app/w/${played.wid}/history/${played.recap.id}`);
  await page.getByRole("button", { name: "Delete recap", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Type DELETE to confirm" })
    .fill("delete");
  await page
    .getByRole("textbox", { name: "Type DELETE to confirm" })
    .press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Recap deleted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first Ruckus leaves a story." }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(played.base + "/analytics/summary")).json())
      .sessions,
  ).toBe(0);
});
