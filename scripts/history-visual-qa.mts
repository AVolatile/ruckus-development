import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { playedSession } from "../tests/browser/history-support.ts";
import { signupWithRetry, appOrigin } from "../tests/browser/fixtures.ts";
const origin = appOrigin,
  out = join(process.cwd(), ".local/visual-qa/phase-5"),
  widths = [320, 390, 768, 1024, 1280, 1440, 1728];
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  throw Error("Visual fixtures are restricted to a local verification server.");
const privateDir = join(
  tmpdir(),
  `ruckus-phase5-qa-${createHash("sha256")
    .update(process.cwd() + origin)
    .digest("hex")
    .slice(0, 20)}`,
);
await mkdir(privateDir, { recursive: true, mode: 0o700 });
await chmod(privateDir, 0o700);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: {
  route: string;
  width: number;
  overflow: number;
  axe: number;
}[] = [];
async function account(name: string) {
  let state;
  try {
    state = JSON.parse(
      await readFile(join(privateDir, name + ".json"), "utf8"),
    );
  } catch {
    /* First run creates generated QA accounts. */
  }
  let context = await browser.newContext({
    baseURL: origin,
    storageState: state,
  });
  let page = await context.newPage();
  if (!(await page.request.get("/api/v1/me")).ok()) {
    await context.close();
    context = await browser.newContext({ baseURL: origin });
    page = await context.newPage();
    const r = await signupWithRetry(page.request, {
      email: `visual-phase5-${randomUUID()}@example.test`,
      name: "Visual QA host",
      password: "A local visual QA passphrase!",
    });
    if (!r.ok()) throw Error("QA account creation failed.");
    await context.storageState({ path: join(privateDir, name + ".json") });
    await chmod(join(privateDir, name + ".json"), 0o600);
  }
  return { context, page };
}
async function capture(
  page: import("@playwright/test").Page,
  route: string,
  label: string,
  width: number,
) {
  await page.setViewportSize({ width, height: 1000 });
  if (new URL(page.url()).origin === origin)
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, route);
  else await page.goto(route);
  await page.locator("main h1").waitFor();
  await page
    .locator('.host-status[data-state="saving"]')
    .waitFor({ state: "hidden" });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - innerWidth),
  );
  const axe = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;
  if (overflow || axe.length)
    throw Error(
      `${label}/${width}: overflow=${overflow}, Axe=${axe.map((v) => v.id).join(",")}`,
    );
  await page.evaluate(() => window.scrollTo(0, 0));
  const filename = `${label}-${width}.png`;
  await page.screenshot({ path: join(out, filename), fullPage: true });
  await page.screenshot({ path: join(out, `${label}-${width}-viewport.png`) });
  if (label === "analytics")
    await page
      .locator(".analytics-game-lineup")
      .screenshot({ path: join(out, `analytics-lineup-${width}.png`) });
  results.push({ route: label, width, overflow, axe: axe.length });
  console.log(`${label} ${width}: no overflow / Axe violations`);
}
try {
  const empty = await account("empty");
  await empty.page.goto("/app/history");
  for (const width of widths) {
    await capture(empty.page, "/app/history", "history-empty", width);
    await capture(
      empty.page,
      "/app/history/analytics",
      "analytics-empty",
      width,
    );
  }
  await empty.context.close();
  const host = await account("played-final");
  let fixture: {
    wid: string;
    original: string;
    studio: string;
    poll: string;
    event: string;
  } | null;
  try {
    fixture = JSON.parse(await readFile(join(out, "fixture.json"), "utf8"));
    const check = await host.page.request.get(
      `/api/v1/workspaces/${fixture.wid}/sessions/${fixture.original}`,
    );
    if (!check.ok()) fixture = null;
  } catch {
    fixture = null;
  }
  if (!fixture) {
    const original = await playedSession(
        host.page,
        "original",
        "scribble-shift",
      ),
      studio = await playedSession(host.page, "studio"),
      poll = await playedSession(host.page, "poll"),
      event = await playedSession(host.page, "event");
    fixture = {
      wid: original.wid,
      original: original.recap.id,
      studio: studio.recap.id,
      poll: poll.recap.id,
      event: event.recap.id,
    };
    await writeFile(
      join(out, "fixture.json"),
      JSON.stringify(fixture, null, 2),
    );
  }
  const prefix = `/app/w/${fixture.wid}`;
  await host.page.goto(prefix + "/history");
  const routes = [
    ["history", prefix + "/history"],
    ["original-recap", prefix + "/history/" + fixture.original],
    ["studio-recap", prefix + "/history/" + fixture.studio],
    ["poll-recap", prefix + "/history/" + fixture.poll],
    ["event-recap", prefix + "/history/" + fixture.event],
    ["analytics", prefix + "/history/analytics?range=30"],
  ];
  for (const width of widths)
    for (const [label, route] of routes)
      await capture(host.page, route, label, width);
  for (const width of [320, 390, 1440]) {
    await capture(
      host.page,
      prefix + "/history?type=event",
      "history-filtered",
      width,
    );
    await host.page.locator(".history-dates summary").click();
    await host.page.screenshot({
      path: join(out, `date-filters-${width}.png`),
      fullPage: true,
    });
    if (width < 700) {
      await host.page
        .getByRole("button", { name: "Menu", exact: false })
        .click();
      await host.page.screenshot({
        path: join(out, `navigation-${width}.png`),
      });
      await host.page
        .getByRole("button", { name: "Close", exact: false })
        .click();
    }
  }
  for (const width of [320, 390, 1440]) {
    await capture(
      host.page,
      prefix + "/history/" + fixture.event,
      "event-provenance",
      width,
    );
    for (const details of await host.page.locator(".recap-provenance").all()) {
      if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
    }
    if (
      await host.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Expanded provenance overflow");
    const violations = (
      await new AxeBuilder({ page: host.page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations;
    if (violations.length) throw Error("Expanded provenance accessibility");
    await host.page.evaluate(() => window.scrollTo(0, 0));
    await host.page.screenshot({
      path: join(out, `expanded-provenance-${width}.png`),
      fullPage: true,
    });
  }
  for (const width of [390, 1440]) {
    await host.page.setViewportSize({ width, height: 1000 });
    await host.page.route("**/api/v1/workspaces/*/sessions?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "UNAVAILABLE",
            message: "History is temporarily unavailable. Try again.",
          },
        }),
      }),
    );
    await host.page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, prefix + "/history?range=all");
    await host.page.getByRole("alert").waitFor();
    await host.page.screenshot({
      path: join(out, `history-error-${width}.png`),
      fullPage: true,
    });
    await host.page.unroute("**/api/v1/workspaces/*/sessions?*");
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    await host.page.route(
      "**/api/v1/workspaces/*/sessions?*",
      async (route) => {
        await gate;
        await route.continue();
      },
    );
    await host.page
      .getByRole("button", { name: "Try again", exact: false })
      .click();
    await host.page
      .getByRole("status")
      .filter({ hasText: "Loading sessions" })
      .waitFor();
    await host.page.screenshot({
      path: join(out, `history-loading-${width}.png`),
      fullPage: true,
    });
    resume();
    await host.page
      .locator('.host-status[data-state="saving"]')
      .waitFor({ state: "hidden" });
    await host.page.unroute("**/api/v1/workspaces/*/sessions?*");
    await host.page.evaluate(
      (path) => {
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
      },
      prefix + "/history/" + fixture.event,
    );
    await host.page.locator("main h1").waitFor();
  }
  await host.context.close();
  await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(
    join(out, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Ruckus Phase 5 visual review</title><style>body{font:16px system-ui;background:#f9f7ed;color:#191a24;margin:32px}nav{display:flex;flex-wrap:wrap;gap:16px}section{margin:40px 0}img{max-width:100%;border:1px solid #191a24}a{color:#2548f4}</style><h1>Phase 5 · Session History & Analytics</h1><p>Generated local QA sessions played through real sockets. Agent visual inspection; human art-direction approval is pending.</p><p><a href="../phase-4-5b/index.html">Preserved original / restored host references</a></p><nav>${routes.map(([label]) => `<a href="#${label}">${label}</a>`).join("")}</nav>${["history-empty", "analytics-empty", ...routes.map(([label]) => label)].map((label) => `<section id="${label}"><h2>${label}</h2><a href="${label}-390.png">Phone full page</a> · <a href="${label}-1440.png">Desktop full page</a><p><img src="${label}-1440-viewport.png" alt="${label} desktop first viewport"></p></section>`).join("")}`,
  );
  console.log(
    JSON.stringify({
      checks: results.length,
      axeViolations: 0,
      overflow: 0,
      out,
    }),
  );
} finally {
  await browser.close();
}
