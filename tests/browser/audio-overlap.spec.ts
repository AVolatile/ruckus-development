import { test, expect, appOrigin } from "./fixtures";
import { observeMusic, seededRoom, singleBed } from "./audio-support";
import { emptyEvent } from "../../shared/events";
import type { GameId } from "../../shared/types";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
async function noPlayerMusic(page: Page) {
  const status = page.locator("[data-audio-state]");
  await expect(status).toHaveAttribute("data-audio-role", "player");
  await expect(status).toHaveAttribute("data-audio-music-current", "0");
  await expect(status).toHaveAttribute("data-audio-music-retiring", "0");
  const probe = await page.evaluate(() =>
    (
      window as unknown as {
        __ruckusMusicProbe: () => { connected: number; playing: number };
      }
    ).__ruckusMusicProbe(),
  );
  expect(probe.connected).toBe(0);
  expect(probe.playing).toBe(0);
}
for (const profile of ["caption-this", "sellout", "scribble-shift"] as const) {
  test(`standalone ${profile} owns one bed through pause and refresh`, async ({
    page,
  }) => {
    await observeMusic(page);
    const { socket, identity } = await seededRoom(page, [profile]);
    const phone = await page.context().newPage();
    await observeMusic(phone);
    try {
      await page.goto(`/room/${identity.code}/host`);
      await phone.goto(`/join?room=${identity.code}`);
      await phone
        .getByLabel("What should we call you?")
        .fill("Second tab player");
      await phone.getByRole("button", { name: "I’m in. Let’s go." }).click();
      await phone
        .getByRole("button", { name: "Enable sound", exact: true })
        .click();
      await noPlayerMusic(phone);
      await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
      await page.getByRole("button", { name: "We’re ready" }).click();
      await singleBed(page, profile);
      if (profile === "scribble-shift") {
        await phone.locator(".drawing-canvas").focus();
        await phone.keyboard.press("Space");
        await phone.keyboard.press("ArrowRight");
        await phone.keyboard.press("Space");
        await phone
          .getByRole("button", { name: "Send my masterpiece" })
          .click();
      } else {
        if (profile === "sellout")
          await phone.getByLabel("Product name").fill("Useful chaos");
        await phone
          .getByLabel(
            profile === "sellout" ? "Your one-line pitch" : "Your caption",
          )
          .fill("A very good game night");
        await phone
          .getByRole("button", { name: "Put it on the big screen" })
          .click();
      }
      await noPlayerMusic(phone);
      const engine = await page
        .locator("[data-audio-state]")
        .getAttribute("data-audio-engine");
      await page.getByRole("button", { name: "Pause P", exact: true }).click();
      await singleBed(page, profile);
      await page.getByRole("button", { name: "Resume P", exact: true }).click();
      await singleBed(page, profile);
      await expect(page.locator("[data-audio-state]")).toHaveAttribute(
        "data-audio-engine",
        engine!,
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Enable sound", exact: true })
        .click();
      await singleBed(page, profile);
      await expect(page.locator("[data-audio-state]")).toHaveAttribute(
        "data-audio-shots",
        "0",
      );
    } finally {
      socket.disconnect();
      await phone.close();
    }
  });
}
test("Hotwire → Caption This → Odd One In → Scribble Shift has one native bed per segment", async ({
  page,
}) => {
  test.setTimeout(100000);
  await observeMusic(page);
  const wid = (await (await page.request.get("/api/v1/workspaces")).json())
    .items[0].id;
  const base = `/api/v1/workspaces/${wid}/events`;
  const profiles: GameId[] = [
    "hotwire",
    "caption-this",
    "odd-one-in",
    "scribble-shift",
  ];
  const definition = emptyEvent("Music ownership regression");
  definition.playlist = profiles.map((gameSlug, order) => ({
    type: "original",
    itemId: randomUUID(),
    order,
    enabled: true,
    displayTitle: "",
    hostNote: "",
    transitionLabel: "",
    gameSlug,
    settings: { rounds: 1, pace: "quick", pack: "mixed" },
  }));
  const storedResponse = await page.request.post(base, {
    headers: { Origin: appOrigin },
    data: { definition },
  });
  expect(storedResponse.ok()).toBe(true);
  const event = await storedResponse.json();
  const launchResponse = await page.request.post(`${base}/${event.id}/launch`, {
    headers: { Origin: appOrigin },
    data: { baseRevisionId: event.revisionId },
  });
  expect(launchResponse.ok()).toBe(true);
  const launch = await launchResponse.json();
  const owner = (await (await page.request.get("/api/v1/me")).json()).user.id;
  await page.addInitScript(
    ({ identity, owner }) => {
      sessionStorage.setItem("ruckus-session", JSON.stringify(identity));
      sessionStorage.setItem("ruckus-audio-owner-v1", owner);
    },
    { identity: launch.identity, owner },
  );
  await page.goto(`/room/${launch.identity.code}/host`);
  await page.getByRole("button", { name: "Add 4 demo players" }).click();
  await singleBed(page, "lobby");
  await page.getByRole("button", { name: "Start event" }).click();
  await page.getByRole("button", { name: "Introduce first game" }).click();
  for (const [index, profile] of profiles.entries()) {
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: "We’re ready" }).click();
    await singleBed(page, profile);
    const engine = await page
      .locator("[data-audio-state]")
      .getAttribute("data-audio-engine");
    if (["caption-this", "scribble-shift"].includes(profile)) {
      await page.getByRole("button", { name: "Pause P", exact: true }).click();
      await page.reload();
      await page
        .getByRole("button", { name: "Enable sound", exact: true })
        .click();
      await singleBed(page, profile);
      await expect(page.locator("[data-audio-state]")).toHaveAttribute(
        "data-audio-shots",
        "0",
      );
      await page.getByRole("button", { name: "Resume P", exact: true }).click();
      await singleBed(page, profile);
    }
    if (["caption-this", "scribble-shift"].includes(profile)) {
      await expect
        .poll(
          async () =>
            Number(
              (await page.locator(".round-response").innerText()).match(
                /(\d+) answers in/,
              )?.[1] || 0,
            ),
          { timeout: 20000 },
        )
        .toBeGreaterThanOrEqual(2);
    }
    await page.getByRole("button", { name: "Close round" }).click();
    if (["caption-this", "scribble-shift"].includes(profile)) {
      await singleBed(page, profile); // Voting keeps the same creative bed.
      await page.getByRole("button", { name: "Reveal votes" }).click();
    }
    await singleBed(page, "results");
    await expect(page.locator("[data-audio-state]")).toHaveAttribute(
      "data-audio-engine",
      engine!,
    );
    await page.getByRole("button", { name: "Next →", exact: true }).click();
    await singleBed(page, "leaderboard");
    await page
      .getByRole("button", {
        name:
          index < profiles.length - 1 ? "Continue event" : "Show event finale",
      })
      .click();
    if (index < profiles.length - 1) {
      await singleBed(page, "intermission");
      await page.getByRole("button", { name: "Introduce next game" }).click();
    }
  }
  await singleBed(page, "finale");
});
