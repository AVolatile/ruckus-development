import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, readdir, chmod } from "node:fs/promises";
import { newBoard } from "../shared/boards.ts";
import { eventTemplate } from "../shared/events.ts";
import { emptyPack } from "../shared/content-packs.ts";
import { defaultBrandConfig } from "../shared/brand.ts";
const root = process.cwd(),
  out =
    root +
    (process.env.VISUAL_QA_PASS === "4.5b"
      ? "/.local/visual-qa/phase-4-5b"
      : "/.local/visual-qa/phase-4-5"),
  mode = process.argv[2] || "baseline",
  origin = process.env.VISUAL_QA_ORIGIN || "http://localhost:4312";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  throw Error(
    "Visual QA writes are restricted to an isolated local verification server.",
  );
if (!["baseline", "current", "final", "original", "review"].includes(mode))
  throw Error("Choose baseline, current, final, original or review.");
await mkdir(out + "/" + mode, { recursive: true, mode: 0o700 });
await chmod(out, 0o700);
// Keep session credentials outside the development server's source root.
const privateDirectory = join(
  tmpdir(),
  `ruckus-visual-qa-${createHash("sha256")
    .update(root + origin)
    .digest("hex")
    .slice(0, 24)}`,
);
const statePath = join(privateDirectory, "state.json");
await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
await chmod(privateDirectory, 0o700);
const browser = await chromium.launch({ headless: true });
if (mode === "original") {
  const page = await browser.newPage();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("https://ruckus-icebreaker-game.netlify.app/", {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: `${out}/original/home-${width}.png`,
      fullPage: true,
    });
    await page.screenshot({
      path: `${out}/original/home-${width}-viewport.png`,
    });
    if (width === 1440)
      console.log(
        await page.locator("nav a").evaluateAll((a) =>
          a.map((x) => ({
            text: x.textContent,
            href: x.getAttribute("href"),
          })),
        ),
      );
    for (const path of ["/games", "/studio", "/host", "/brand"]) {
      await page.goto("https://ruckus-icebreaker-game.netlify.app" + path, {
        waitUntil: "networkidle",
      });
      await page.screenshot({
        path: `${out}/original/${path.slice(1)}-${width}.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `${out}/original/${path.slice(1)}-${width}-viewport.png`,
      });
    }
  }
} else {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(out + "/manifest.json", "utf8"));
  } catch {
    /* First capture creates an isolated QA account and manifest. */
  }
  const context = await browser.newContext(
      manifest ? { storageState: statePath } : {},
    ),
    page = await context.newPage();
  const post = async (path, data) => {
    const r = await context.request.post(origin + path, {
      data,
      headers: { Origin: origin },
    });
    if (!r.ok()) throw Error(path + " returned " + r.status());
    return r.json();
  };
  if (!manifest) {
    const email = `visual-phase45-${Date.now()}@example.test`;
    await post("/api/auth/sign-up/email", {
      email,
      password: "VisualQA-only-2026!",
      name: "Visual QA",
    });
    let link = "";
    for (let n = 0; n < 50 && !link; n++) {
      for (const file of await readdir(root + "/.local/mail")) {
        const m = JSON.parse(
          await readFile(root + "/.local/mail/" + file, "utf8"),
        );
        if (m.to === email && m.subject.startsWith("Verify"))
          link = m.text.split("\n").find((l) => l.startsWith(origin)) || "";
      }
      if (!link) await new Promise((r) => setTimeout(r, 100));
    }
    await page.goto(link);
    await page
      .getByRole("button", { name: "Verify email", exact: true })
      .click();
    await page
      .getByText("Your email is verified. Your workspace is ready.")
      .waitFor();
    const ws = await (
        await context.request.get(origin + "/api/v1/workspaces")
      ).json(),
      wid = ws.items[0].id,
      base = "/api/v1/workspaces/" + wid;
    const board = newBoard();
    board.title = "Friday knowledge club";
    const b = await post(base + "/boards", { board });
    const event = await post(base + "/events", {
      definition: eventTemplate("friday-wind-down", () => crypto.randomUUID()),
    });
    const pack = emptyPack("hotwire", "Friday Brainwaves");
    pack.shortDescription = "A quick mix for curious company.";
    pack.content.items = [
      {
        id: "q1",
        title: "Which planet is known as the red planet?",
        options: ["Mars", "Venus", "Earth", "Jupiter"],
        answer: 0,
      },
    ];
    const p = await post(base + "/content-packs", { document: pack });
    const brand = await post(base + "/brand-kits", {
      name: "Friday Club",
      config: defaultBrandConfig,
    });
    manifest = {
      wid,
      board: b.board?.id ?? b.id,
      event: event.id,
      pack: p.id,
      brand: brand.id,
    };
    console.log("QA entity response keys", Object.keys(b), Object.keys(brand));
    await page.goto(origin + "/app");
    await page.waitForURL("**/app/w/**");
    await page.evaluate(
      (board) =>
        localStorage.setItem("ruckus-studio-v1", JSON.stringify([board])),
      newBoard(),
    );
    await context.storageState({ path: statePath });
    await chmod(statePath, 0o600);
    await writeFile(out + "/manifest.json", JSON.stringify(manifest));
  }
  await page.goto(origin + "/app/w/" + manifest.wid);
  await page.locator(".host-app").waitFor();
  const prefix = "/app/w/" + manifest.wid;
  const routes = {
    home: "",
    originals: "/originals",
    original: "/originals/hotwire",
    setup: "/host?game=hotwire",
    studio: "/studio",
    board: "/studio/boards/" + manifest.board,
    "board-preview": "/studio/boards/" + manifest.board + "/preview",
    library: "/library",
    packs: "/content-packs",
    "pack-detail": "/content-packs/40000000-0000-4000-8000-000000000001",
    "pack-editor": "/content-packs/" + manifest.pack + "/edit",
    "pack-new": "/content-packs/new",
    events: "/events",
    "event-builder": "/events/" + manifest.event,
    "event-preview": "/events/" + manifest.event + "/preview",
    "event-new": "/events/new",
    brand: "/brand",
    "brand-editor": "/brand/" + manifest.brand,
    workspace: "/workspace",
    members: "/members",
    activity: "/activity",
    settings: "/settings",
    future: "/analytics",
  };
  const results = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const selectedRoutes = process.env.VISUAL_QA_ROUTES?.split(",");
  for (const width of process.env.VISUAL_QA_WIDTHS
    ? process.env.VISUAL_QA_WIDTHS.split(",").map(Number)
    : mode === "final"
      ? [1440, 390, 320, 768, 1024, 1280, 1728]
      : [1440, 390]) {
    const widthStarted = Date.now();
    await page.setViewportSize({ width, height: 1000 });
    for (const [label, path] of Object.entries(routes)) {
      if (selectedRoutes && !selectedRoutes.includes(label)) continue;
      await page.evaluate((path) => {
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
      }, prefix + path);
      await page.waitForTimeout(550);
      await page.waitForLoadState("networkidle");
      await page.locator(".host-app").waitFor();
      await page.locator("h1, #board-title").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${out}/${mode}/${label}-${width}.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `${out}/${mode}/${label}-${width}-viewport.png`,
      });
      if (errors.length) throw Error(label + ": " + errors.join("; "));
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        title: document.querySelector("h1")?.textContent,
        top: document.querySelector("h1")?.getBoundingClientRect().top,
      }));
      if (metrics.overflow > 0) throw Error(`${label} overflows at ${width}px`);
      if (mode === "final" && width === 1440) {
        const a = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        metrics.violations = a.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        }));
      }
      results.push({ label, width, ...metrics });
      console.log(label, width, metrics.overflow, Math.round(metrics.top || 0));
    }
    if (mode === "final" && Date.now() - widthStarted < 61000)
      await page.waitForTimeout(61000 - (Date.now() - widthStarted));
  }
  await writeFile(
    out + "/" + mode + "/metrics.json",
    JSON.stringify(results, null, 2),
  );
}
await browser.close();
