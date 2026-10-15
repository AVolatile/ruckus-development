import { test, expect, appOrigin } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const marketing = [
  "/",
  "/product",
  "/teams",
  "/events",
  "/pricing",
  "/login",
  "/signup",
  "/resources",
];

test.describe("public and guest boundaries", () => {
  test.use({ hostAccount: false });
  test("public pages avoid realtime/question banks and guests never meet an auth wall", async ({
    page,
  }) => {
    const unexpected: string[] = [];
    page.on("request", (request) => {
      if (
        /socket\.io|src\/lib\/party|\/assets\/party-|shared\/content\/(library|knowledge|after-hours)\.|\/assets\/library-/.test(
          request.url(),
        )
      )
        unexpected.push(request.url());
    });
    for (const route of marketing) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.locator(
          'a[href="/campaign"], a[href="/brand"], a[href="/case-study"]',
        ),
      ).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(
        /portfolio|fictional startup|Fidelity/i,
      );
    }
    expect(unexpected).toEqual([]);
    for (const route of [
      "/app",
      "/app/studio/boards/new",
      "/app/originals/hotwire",
      "/app/settings",
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp("/login\\?returnTo="));
      await expect(
        page.getByRole("navigation", { name: "Host navigation", exact: true }),
      ).toHaveCount(0);
    }
    await page.goto("/join?room=ABCDE");
    await expect(page.getByLabel("Room code")).toHaveValue("ABCDE");
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});

test("legacy paths retain query/hash and retired portfolio pages stay retired", async ({
  page,
}) => {
  for (const [before, after] of [
    ["/studio?source=saved#starters", "/app/studio?source=saved#starters"],
    ["/studio/boards", "/app/studio/boards"],
    [
      "/studio/boards/00000000-0000-4000-8000-000000000000/preview?from=export",
      "/app/studio/boards/00000000-0000-4000-8000-000000000000/preview?from=export",
    ],
    ["/games/hotwire", "/app/originals/hotwire"],
    ["/host?game=sellout", "/app/host?game=sellout"],
    ["/how-it-works", "/product"],
    ["/for-teams", "/teams"],
    ["/remote", "/teams"],
    ["/about", "/product"],
  ]) {
    await page.goto(before);
    await expect(page).toHaveURL(appOrigin + after);
    await expect(page.locator("main h1")).toBeVisible();
  }
  for (const route of ["/brand", "/campaign", "/case-study"]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Wrong room. Right people." }),
    ).toBeVisible();
  }
});

test("dashboard uses real account boards and template copies persist", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Your first board starts here." }),
  ).toBeVisible();
  await expect(page.locator(".game-grid .game-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Make it mine" }).first().click();
  await expect(page.getByLabel("Board title")).toBeVisible();
  const title = await page.getByLabel("Board title").inputValue();
  await page.getByRole("button", { name: "Save & return" }).click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".board-grid")).toContainText(title);
  await page.reload();
  await expect(page.locator(".board-grid")).toContainText(title);
  await page.goto("/app/studio");
  await expect(page.locator(".template-grid")).not.toContainText("Paper Moon");
});

test("responsive host/public surfaces retain keyboard navigation and accessible account forms", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const anonymous = await browser.newContext();
  const account = await anonymous.newPage();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/product",
      "/teams",
      "/events",
      "/pricing",
      "/app",
      "/app/library",
      "/app/settings",
      "/app/events",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}`,
      ).toBe(true);
    }
    await account.setViewportSize({ width, height: 900 });
    await account.goto(appOrigin + "/signup");
    await expect(account.getByLabel("Email", { exact: true })).toBeVisible();
    expect(
      await account.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/app");
    if (width <= 1100) {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("link", { name: "Originals", exact: true }).click();
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["/app", "/app/library", "/app/settings"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  expect(
    (
      await new AxeBuilder({ page: account })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "A head start." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase-1/dashboard-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await account.setViewportSize({ width: 390, height: 844 });
  await account.screenshot({
    path: "test-results/phase-1/signup-390.png",
    fullPage: true,
    animations: "disabled",
  });
  await anonymous.close();
});
