import { expect, test } from "@playwright/test";
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

test("public routes never load the live session or question bank; accounts remain honest", async ({
  page,
}) => {
  const realtime: string[] = [],
    content: string[] = [];
  page.on("request", (request) => {
    if (/socket\.io|src\/lib\/party|\/assets\/party-/.test(request.url()))
      realtime.push(request.url());
    if (
      /shared\/content\/(library|knowledge|after-hours)\.|\/assets\/library-/.test(
        request.url(),
      )
    )
      content.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (socket.url().includes("socket.io")) realtime.push(socket.url());
  });
  for (const route of marketing) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation", exact: true }),
    ).toBeAttached();
    await expect(
      page.getByRole("navigation", { name: "Host navigation", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        'a[href="/campaign"], a[href="/brand"], a[href="/case-study"]',
      ),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      /portfolio|fictional startup|Fidelity/i,
    );
  }
  expect(realtime).toEqual([]);
  expect(content).toEqual([]);
  for (const route of ["/login", "/signup"]) {
    await page.goto(route);
    await expect(page.getByText("HOST ACCOUNTS / COMING SOON")).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    await page.getByRole("link", { name: "Continue to host tools" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("navigation", { name: "Host navigation", exact: true }),
    ).toBeAttached();
  }
});

test("legacy paths preserve parameters, queries and fragments; portfolio routes are retired", async ({
  page,
}) => {
  for (const [before, after] of [
    ["/studio?source=saved#starters", "/app/studio?source=saved#starters"],
    ["/studio/boards", "/app/studio/boards"],
    [
      "/studio/boards/missing/preview?from=export",
      "/app/studio/boards/missing/preview?from=export",
    ],
    ["/games/hotwire", "/app/originals/hotwire"],
    ["/host?game=sellout", "/app/host?game=sellout"],
    ["/how-it-works", "/product"],
    ["/for-teams", "/teams"],
    ["/remote", "/teams"],
    ["/about", "/product"],
  ]) {
    await page.goto(before);
    await expect(page).toHaveURL(`http://localhost:4310${after}`);
    await expect(page.locator("main h1")).toBeVisible();
  }
  for (const route of ["/brand", "/campaign", "/case-study"]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Wrong room. Right people." }),
    ).toBeVisible();
  }
});

test("dashboard uses local boards, template copies persist, guests have isolated chrome", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Your first board starts here." }),
  ).toBeVisible();
  await expect(page.locator(".game-grid .game-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Make it mine" }).first().click();
  await expect(page).toHaveURL(/\/app\/studio\/boards\/[^/]+$/);
  const title = await page.getByLabel("Board title").inputValue();
  await page.getByRole("button", { name: "Save & return" }).click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".board-grid")).toContainText(title);
  await page.reload();
  await expect(page.locator(".board-grid")).toContainText(title);
  await page.goto("/app/studio");
  await expect(page.locator(".template-grid")).not.toContainText("Paper Moon");
  await page.goto("/join?room=ABCDE");
  await expect(page.getByLabel("Room code")).toHaveValue("ABCDE");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByLabel("What should we call you?")).toBeVisible();
});

test("surface navigation works on small screens, routes refresh, and new pages are accessible", async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/product",
      "/teams",
      "/events",
      "/signup",
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
        `${route} at ${width}px`,
      ).toBe(true);
    }
    await page.goto("/app");
    if (width <= 1100) {
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(
        page.getByRole("link", { name: "Originals", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Originals", exact: true }).click();
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["/signup", "/app", "/app/library", "/app/settings"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
  }
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "A head start." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase-0/dashboard-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Free accounts are on the way." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/phase-0/signup-390.png",
    fullPage: true,
    animations: "disabled",
  });
});
