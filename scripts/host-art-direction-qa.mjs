import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Local-only rendered evidence. This does not replace human art-direction review.
const root = process.cwd();
const out = join(root, ".local/visual-qa/phase-4-5b");
const origin = process.env.VISUAL_QA_ORIGIN || "http://localhost:4312";
const mode = process.argv[2] || "compare";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  throw Error("Use an isolated local QA origin.");
if (!["states", "compare"].includes(mode))
  throw Error("Choose states or compare.");
const privateDirectory = join(
  tmpdir(),
  `ruckus-visual-qa-${createHash("sha256")
    .update(root + origin)
    .digest("hex")
    .slice(0, 24)}`,
);
const browser = await chromium.launch();
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
try {
  if (mode === "compare") {
    await mkdir(join(out, "comparisons"), { recursive: true });
    const page = await browser.newPage();
    const families = [
      ["library", "home", "Home / asymmetric discovery and section bands"],
      ["originals", "games", "Games / numbered icons, orbit and game colors"],
      ["packs", "games", "Games / parent mechanic + authored-cover hierarchy"],
      [
        "studio",
        "studio",
        "Studio / split answer-card invitation and workbench",
      ],
      ["events", "host", "Setup / ordered game selection and house rules"],
      ["settings", "host", "Setup / restrained outlined controls"],
      ["brand", "brand", "Brand / marks, palette and real touchpoints"],
    ];
    let index =
      '<!doctype html><meta charset="utf-8"><title>Ruckus Phase 4.5B review</title><style>body{font:16px system-ui;margin:40px;background:#f9f7ed;color:#191a24}a{color:#2548f4}section{margin:40px 0}img{max-width:100%;border:1px solid}p{max-width:80ch}</style><h1>Phase 4.5B — ready for human review</h1><p>Human approval: pending Anthony’s review. Original references show compositional lineage, not feature parity. All production images use generated local QA data. Session credentials are outside this directory.</p>';
    for (const [family, reference, reason] of families) {
      index += `<section><h2>${family}</h2><p>${escape(reason)}</p>`;
      for (const width of [1440, 390]) {
        for (const viewport of [false, true]) {
          const suffix = viewport ? "-viewport" : "";
          const frames = [
            [
              "Original reference",
              `original/${reference}-${width}${suffix}.png`,
            ],
            [
              "Phase 4.5 / human-rejected direction",
              `current/${family}-${width}${suffix}.png`,
            ],
            [
              "Phase 4.5B / pending review",
              `final/${family}-${width}${suffix}.png`,
            ],
          ];
          const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f9f7ed;color:#191a24;font:14px system-ui}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 20px}.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}h2{font-size:14px;min-height:36px;margin:0 0 12px}img{width:100%;height:auto;display:block;border:1px solid #191a24}</style><h1>${family} / ${width}px / ${viewport ? "first viewport" : "full page"}</h1><p>${escape(reason)} · Human approval pending</p><div class="frames">${frames.map(([label, path]) => `<article><h2>${label}</h2><img src="file://${escape(join(out, path))}"></article>`).join("")}</div>`;
          // HTML outside the Vite tree avoids hot-reloading the active capture app.
          const htmlPath = join(
            tmpdir(),
            `ruckus-phase45b-${family}-${width}${suffix}.html`,
          );
          await writeFile(htmlPath, html);
          await page.setViewportSize({
            width: width === 390 ? 1240 : 1800,
            height: width === 390 ? 1000 : 560,
          });
          await page.goto("file://" + htmlPath);
          await page
            .locator("img")
            .evaluateAll((imgs) =>
              Promise.all(imgs.map((img) => img.decode())),
            );
          const target = `comparisons/${family}-${width}${suffix}.png`;
          await page.screenshot({ path: join(out, target), fullPage: true });
          index += `<p><a href="${target}">${width}px — ${viewport ? "first viewport" : "full-page contact sheet"}</a></p>`;
          if (viewport)
            index += `<a href="${target}"><img loading="lazy" src="${target}" alt="${family} at ${width}px: original reference, Phase 4.5 and corrected Phase 4.5B"></a>`;
        }
      }
      index += "</section>";
    }
    index += "<section><h2>Responsive composition review</h2>";
    const responsiveFamilies = [
      "home",
      "library",
      "originals",
      "packs",
      "studio",
      "events",
      "brand",
      "settings",
    ];
    for (const width of [320, 768, 1024]) {
      for (let offset = 0; offset < responsiveFamilies.length; offset += 4) {
        const families = responsiveFamilies.slice(offset, offset + 4);
        const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f9f7ed;color:#191a24;font:14px system-ui}h1{font-size:24px}h2{font-size:16px}.frames{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;align-items:start}img{width:100%;height:auto;border:1px solid #191a24}</style><h1>Corrected composition / ${width}px / human approval pending</h1><div class="frames">${families.map((family) => `<article><h2>${family}</h2><img src="file://${escape(join(out, `final/${family}-${width}-viewport.png`))}"></article>`).join("")}</div>`;
        const htmlPath = join(
          tmpdir(),
          `ruckus-phase45b-responsive-${width}-${offset}.html`,
        );
        await writeFile(htmlPath, html);
        await page.setViewportSize({ width: 1800, height: 600 });
        await page.goto("file://" + htmlPath);
        await page
          .locator("img")
          .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
        const target = `comparisons/responsive-${width}-${offset / 4 + 1}.png`;
        await page.screenshot({ path: join(out, target), fullPage: true });
        index += `<p><a href="${target}">${width}px: ${families.join(", ")}</a></p>`;
      }
    }
    index += "</section>";
    // Run compare after source capture finishes: writing HTML may trigger Vite.
    await writeFile(join(out, "index.html"), index);
    console.log(
      "Wrote 28 original/current/corrected comparisons, six responsive sheets and review index.",
    );
  } else {
    await mkdir(join(out, "states"), { recursive: true });
    const manifest = JSON.parse(
      await readFile(join(out, "manifest.json"), "utf8"),
    );
    const context = await browser.newContext({
      storageState: join(privateDirectory, "state.json"),
    });
    const page = await context.newPage();
    const prefix = `/app/w/${manifest.wid}`;
    const checks = [];
    async function go(path) {
      if (!page.url().startsWith(origin))
        await page.goto(origin + prefix + path);
      else
        await page.evaluate((path) => {
          history.pushState({}, "", path);
          dispatchEvent(new PopStateEvent("popstate"));
        }, prefix + path);
      await page.waitForLoadState("networkidle");
      await page.locator(".host-app").waitFor();
      await page.evaluate(() => document.fonts.ready);
    }
    async function capture(label, axe = true) {
      const width = page.viewportSize().width;
      await page.screenshot({
        path: join(out, `states/${label}-${width}.png`),
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      const violations = axe
        ? (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          }))
        : [];
      checks.push({ label, width, overflow, violations });
      if (overflow || violations.length)
        throw Error(`${label} at ${width}: overflow or Axe failure`);
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await go("/library");
      const originals = page.locator(".library-originals");
      await originals.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      if (!(await originals.evaluate((el) => el.matches(":focus-visible"))))
        throw Error("Library keyboard focus is not visibly represented.");
      await capture("library-focus");
      await originals.hover();
      await page.waitForTimeout(200);
      await capture("library-hover", false);
      await page.locator(".workspace-switcher > button").click();
      await capture("workspace-expanded");
      await page.locator(".workspace-switcher > button").press("Escape");
      if (width < 1100) {
        await page.locator(".menu-toggle").click();
        await capture("mobile-navigation");
        await page.locator(".menu-toggle").click();
      }
      await page
        .getByRole("button", { name: "Review local boards →", exact: true })
        .click();
      await page.locator("#local-import-details").scrollIntoViewIfNeeded();
      await capture("import-expanded");
      await go("/content-packs?q=phase45b-no-such-pack");
      await page
        .getByRole("heading", { name: "No packs in this mix yet." })
        .waitFor();
      await page
        .getByRole("heading", { name: "No packs in this mix yet." })
        .scrollIntoViewIfNeeded();
      await capture("packs-empty");
      await go("/content-packs");
      await page.locator(".pack-more-filters summary").click();
      await capture("packs-expanded");
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
      await go("/content-packs?q=error-rehearsal");
      await page
        .getByRole("button", { name: "Try loading packs again" })
        .waitFor();
      await page.getByRole("alert").scrollIntoViewIfNeeded();
      await capture("packs-error");
      await page.unroute("**/api/v1/workspaces/*/content-packs?*");
      await page
        .getByRole("button", { name: "Try loading packs again" })
        .click();
      await page
        .getByRole("heading", { name: "No packs in this mix yet." })
        .waitFor();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await page.route(
        "**/api/v1/workspaces/*/content-packs?*",
        async (route) => {
          await gate;
          await route.continue();
        },
      );
      await page.evaluate((path) => {
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
      }, prefix + "/content-packs?q=loading");
      await page.getByText("Loading packs…", { exact: true }).waitFor();
      await page
        .getByText("Loading packs…", { exact: true })
        .scrollIntoViewIfNeeded();
      await capture("packs-loading", false);
      release();
      await page.waitForLoadState("networkidle");
      await page.unroute("**/api/v1/workspaces/*/content-packs?*");
      await go(`/events/${manifest.event}`);
      await page.locator(".event-segment-options summary").first().click();
      await page
        .locator(".event-playlist > li")
        .first()
        .scrollIntoViewIfNeeded();
      await capture("event-customize");
      await go(`/studio/boards/${manifest.board}`);
      await page.locator(".answer-editor-cards").scrollIntoViewIfNeeded();
      await capture("studio-answers");
      await page.locator(".question-rules").scrollIntoViewIfNeeded();
      await capture("studio-rules");
      await go("/brand");
      await page.getByRole("button", { name: "Winner", exact: true }).click();
      await page.locator(".brand-stage").scrollIntoViewIfNeeded();
      await capture("brand-winner");
      await go("/settings");
      await page
        .getByRole("slider", { name: /Music volume/ })
        .scrollIntoViewIfNeeded();
      await capture("settings-audio");
      await go("");
      const start = page.locator(".dashboard-hero .button").first();
      await start.hover();
      const box = await start.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(200);
      await capture("button-press", false);
      await page.mouse.move(1, 1);
      await page.mouse.up();
    }
    // A real mixed Event verifies the Studio color/sequence beside Originals.
    const base = `/api/v1/workspaces/${manifest.wid}/events`;
    const current = await (
      await context.request.get(origin + base + "/" + manifest.event)
    ).json();
    const definition = structuredClone(current.definition);
    definition.title = "Originals + a Studio interlude";
    definition.playlist.push({
      itemId: crypto.randomUUID(),
      type: "studio_board",
      enabled: true,
      order: definition.playlist.length,
      displayTitle: "Studio interlude",
      hostNote: "",
      transitionLabel: "",
      boardId: manifest.board,
      settings: {},
    });
    const saved = await (await context.request.get(origin + base)).json();
    let event = saved.items.find((item) => item.name === definition.title);
    if (!event) {
      const response = await context.request.post(origin + base, {
        headers: { Origin: origin },
        data: { definition },
      });
      if (!response.ok())
        throw Error("QA mixed Event creation failed: " + response.status());
      event = await response.json();
    }
    for (const width of [320, 390, 768, 1024, 1280, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1000 });
      await go("/events/" + event.id);
      await page
        .locator(".event-playlist > li")
        .last()
        .scrollIntoViewIfNeeded();
      await capture("mixed-event-studio");
    }
    await writeFile(
      join(out, "states/metrics.json"),
      JSON.stringify(checks, null, 2),
    );
    console.log(
      `${checks.length} state captures, zero overflow and Axe violations in checked states.`,
    );
  }
} finally {
  await browser.close();
}
