import { test, expect, appOrigin } from "./fixtures";
import {
  emptyPack,
  defaultPackId,
  packExport,
  type PackRecord,
} from "../../shared/content-packs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(10000);
});
async function check(page: Page, label: string) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${label}: ${width}px`,
    ).toBe(true);
  }
  await mkdir("test-results/phase-4", { recursive: true });
  await page.screenshot({
    path: `test-results/phase-4/${label}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `test-results/phase-4/${label}-phone.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function workspace(page: Page) {
  return (await (await page.request.get("/api/v1/workspaces")).json()).items[0]
    .id as string;
}
const authored = (name = "Workshop questions") => ({
  ...emptyPack("hotwire", name),
  status: "ready" as const,
  content: {
    gameType: "hotwire" as const,
    items: [
      {
        id: "one",
        title: "The workshop answer?",
        options: ["Our answer", "Another answer"],
        answer: 0,
        explanation: "Our team wrote this question.",
      },
    ],
  },
});
test("Library pack discovery, structured authoring, reordering, preview and portable copy/import", async ({
  page,
}) => {
  test.setTimeout(120000);
  const wid = await workspace(page),
    base = `/api/v1/workspaces/${wid}/content-packs`;
  let connections = 0;
  page.on("websocket", (socket) => {
    // Source-mode QA has a Vite HMR socket; this boundary concerns game realtime.
    if (new URL(socket.url()).pathname.startsWith("/socket.io")) connections++;
  });
  await page.goto(`/app/w/${wid}/library`);
  await page
    .getByRole("link", { name: /Content Packs.*Find your next pack/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Content Packs.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Game", exact: true })
    .selectOption("hotwire");
  await expect(
    page.getByRole("heading", { name: "General Knowledge", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Food for Thought", exact: true }),
  ).toBeVisible();
  await check(page, "catalog");
  await page.getByRole("link", { name: /Create private pack/ }).click();
  await check(page, "new-pack");
  await page.getByLabel("Pack name").fill("Our Friday knowledge");
  await page.getByRole("button", { name: /Create private pack/ }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Our Friday knowledge",
  );
  const id = page.url().split("/").at(-2)!;
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Our own room, our own questions. " + "x".repeat(500));
  await page.getByRole("button", { name: "Add item +", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Prompt", exact: true })
    .fill("Which answer belongs to our room?");
  await page.getByLabel("Choice 1", { exact: true }).fill("Our answer");
  await page.getByLabel("Choice 2", { exact: true }).fill("Their answer");
  await page.getByLabel("Choice 3", { exact: true }).fill("Another answer");
  await page.getByLabel("Choice 4", { exact: true }).fill("Last answer");
  await page
    .getByLabel("Explanation", { exact: true })
    .fill("This is our authored answer key.");
  await page
    .getByRole("button", { name: "Duplicate item", exact: true })
    .click();
  const prompts = page.getByRole("textbox", { name: "Prompt", exact: true });
  await prompts.nth(1).fill("Second question in the pack");
  await page
    .getByRole("button", { name: "Move item 2 up", exact: true })
    .click();
  await expect(prompts.nth(0)).toHaveValue("Second question in the pack");
  await page.getByLabel("Availability").selectOption("ready");
  await expect
    .poll(async () => {
      const r = await (await page.request.get(`${base}/${id}`)).json();
      return [r.document.status, r.document.content.items[0]?.title];
    })
    .toEqual(["ready", "Second question in the pack"]);
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to workspace" }),
  ).toBeVisible();
  await check(page, "editor");
  const first = (await (
    await page.request.get(`${base}/${id}`)
  ).json()) as PackRecord;
  await page
    .getByLabel("Name", { exact: true })
    .fill("Our Friday knowledge revised");
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${base}/${id}`)).json()).revisionNumber,
    )
    .toBeGreaterThan(first.revisionNumber);
  await page.getByRole("link", { name: "← Pack details", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Host preview", exact: true }),
  ).toBeVisible();
  await check(page, "detail");
  expect(connections).toBe(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("ruckus-content-pack.json");
  await page
    .getByRole("button", { name: "Create editable copy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Our Friday knowledge revised (copy)",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`/app/w/${wid}/content-packs`);
  await page.getByLabel("Import pack JSON").setInputFiles({
    name: "portable.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify(packExport(authored("Portable workshop"))),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Portable workshop", exact: true }),
  ).toBeVisible();
});
test("selected standalone pack and Event pack launch to an account-free guest and freeze later edits", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const wid = await workspace(page),
    base = `/api/v1/workspaces/${wid}`,
    created = await page.request.post(base + "/content-packs", {
      headers: { Origin: appOrigin },
      data: { document: authored() },
    });
  expect(created.ok()).toBe(true);
  const pack = (await created.json()) as PackRecord;
  const guestContext = await browser.newContext(),
    guest = await guestContext.newPage();
  try {
    expect(
      (await guest.request.get(appOrigin + "/api/v1/content-packs")).status(),
    ).toBe(401);
    expect(
      (
        await guest.request.get(appOrigin + base + "/content-packs/" + pack.id)
      ).status(),
    ).toBe(401);
    await page.goto(`/app/w/${wid}/host?game=hotwire&contentPackId=${pack.id}`);
    await expect(
      page.getByRole("combobox", { name: "Content pack", exact: true }),
    ).toHaveValue(pack.id);
    await check(page, "setup");
    await page.getByRole("button", { name: /Open the room/ }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z2-9]+\/host/);
    let code = page.url().split("/").at(-2)!;
    await page.getByRole("button", { name: "+ 4 demo players" }).click();
    await guest.goto(appOrigin + `/join?room=${code}`);
    await guest.getByLabel("What should we call you?").fill("Pack guest");
    await guest.getByRole("button", { name: "I’m in. Let’s go." }).click();
    await expect(guest).toHaveURL(/\/play/);
    await page.getByRole("button", { name: /Let’s make a ruckus/ }).click();
    await page.getByRole("button", { name: /We’re ready/ }).click();
    await expect(
      page.getByText("The workshop answer?", { exact: true }),
    ).toBeVisible();
    await guest.getByRole("button", { name: /Our answer/ }).click();
    await page.goto(
      `/app/w/${wid}/events/new?game=hotwire&contentPackId=${pack.id}`,
    );
    await page.getByLabel("Event title").fill("Pack-powered event");
    await page.getByRole("button", { name: /Build this event/ }).click();
    await expect(page.getByLabel("Event title")).toHaveValue(
      "Pack-powered event",
    );
    await expect(page).toHaveURL(/\/events\/[a-f0-9-]{36}$/);
    const eid = page.url().split("/").at(-1)!;
    await page
      .getByLabel("Add an Original", { exact: true })
      .selectOption("room-temperature");
    for (const s of await page.locator(".event-segment-options summary").all())
      await s.click();
    await expect(
      page.getByRole("combobox", { name: "Content pack", exact: true }).nth(0),
    ).toHaveValue(pack.id);
    await page
      .getByRole("combobox", { name: "Content pack", exact: true })
      .nth(1)
      .selectOption(defaultPackId("room-temperature"));
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`${base}/events/${eid}`)).json())
            .definition.playlist.length,
      )
      .toBe(2);
    // Use the real guarded launch endpoint, then open the returned stage identity just as PartyProvider does.
    const event = await (
        await page.request.get(`${base}/events/${eid}`)
      ).json(),
      launch = await page.request.post(`${base}/events/${eid}/launch`, {
        headers: { Origin: appOrigin },
        data: { baseRevisionId: event.revisionId },
      });
    expect(launch.ok()).toBe(true);
    const reply = await launch.json();
    await page.evaluate(
      (identity) =>
        sessionStorage.setItem("ruckus-session", JSON.stringify(identity)),
      reply.identity,
    );
    await page.goto(`/room/${reply.identity.code}/host`);
    code = reply.identity.code;
    const revised = structuredClone(pack.document);
    revised.content.items[0].title = "Changed after the event launched";
    expect(
      (
        await page.request.put(`${base}/content-packs/${pack.id}`, {
          headers: { Origin: appOrigin },
          data: { document: revised, baseRevisionId: pack.revisionId },
        })
      ).ok(),
    ).toBe(true);
    await page.getByRole("button", { name: "Add 4 demo players" }).click();
    await guest.goto(appOrigin + `/join?room=${code}`);
    await guest.getByLabel("What should we call you?").fill("Event pack guest");
    await guest.getByRole("button", { name: "I’m in. Let’s go." }).click();
    await page.getByRole("button", { name: /Start event/ }).click();
    await page.getByRole("button", { name: "Introduce first game" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.getByRole("button", { name: /We’re ready/ }).click();
    await expect(
      page.getByText("The workshop answer?", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Changed after the event launched", { exact: true }),
    ).toHaveCount(0);
    await guest.getByRole("button", { name: /Our answer/ }).click();
  } finally {
    await guestContext.close();
  }
});
test("pack autosave preserves in-flight edits, recovers conflicts and keeps account-scoped tab drafts", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const wid = await workspace(page),
    base = `/api/v1/workspaces/${wid}/content-packs`,
    r = (await (
      await page.request.post(base, {
        headers: { Origin: appOrigin },
        data: { document: authored("Autosave pack") },
      })
    ).json()) as PackRecord;
  let signal: () => void = () => {};
  const started = new Promise<void>((resolve) => (signal = resolve));
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  await page.route(
    `**/api/v1/workspaces/${wid}/content-packs/${r.id}`,
    async (route) => {
      if (route.request().method() === "PUT" && !held) {
        held = true;
        signal();
        await wait;
      }
      await route.continue();
    },
  );
  await page.goto(`/app/w/${wid}/content-packs/${r.id}/edit`);
  await page.getByLabel("Name", { exact: true }).fill("First in flight");
  await started;
  await page.getByLabel("Name", { exact: true }).fill("Latest survives");
  release();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${base}/${r.id}`)).json()).name,
    )
    .toBe("Latest survives");
  const second = await context.newPage();
  try {
    await second.goto(`/app/w/${wid}/content-packs/${r.id}/edit`);
    await expect(second.getByLabel("Name", { exact: true })).toHaveValue(
      "Latest survives",
    );
    await page.getByLabel("Name", { exact: true }).fill("New cloud title");
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`${base}/${r.id}`)).json()).name,
      )
      .toBe("New cloud title");
    await second.getByLabel("Name", { exact: true }).fill("My retained draft");
    await expect(second.getByRole("alert")).toContainText("newer pack");
    await expect(second.getByLabel("Name", { exact: true })).toHaveValue(
      "My retained draft",
    );
    await second.reload();
    await expect(second.getByLabel("Name", { exact: true })).toHaveValue(
      "My retained draft",
    );
    await expect(second.getByRole("alert")).toContainText("older base");
    const dl = second.waitForEvent("download");
    await second
      .getByRole("button", { name: "Export edits", exact: true })
      .click();
    await dl;
    second.once("dialog", (d) => d.accept());
    await second
      .getByRole("button", { name: "Load latest", exact: true })
      .click();
    await expect(second.getByLabel("Name", { exact: true })).toHaveValue(
      "New cloud title",
    );
  } finally {
    await second.close();
  }
});
