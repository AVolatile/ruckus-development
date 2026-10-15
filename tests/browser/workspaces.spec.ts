import { test, expect, appOrigin } from "./fixtures";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
async function emailLink(email: string, subject: string) {
  let result = "";
  await expect
    .poll(
      async () => {
        for (const filename of await readdir(".local/mail")) {
          const message = JSON.parse(
            await readFile(`.local/mail/${filename}`, "utf8"),
          );
          if (message.to === email && message.subject.startsWith(subject)) {
            result =
              message.text
                .split("\n")
                .find((line: string) => line.startsWith(appOrigin)) || "";
            break;
          }
        }
        return !!result;
      },
      { message: "Transactional email delivered to local test capture" },
    )
    .toBe(true);
  return result;
}
async function account(page: Page) {
  const email = `workspace-browser-${randomUUID()}@example.test`;
  const response = await page.request.post(
    appOrigin + "/api/auth/sign-up/email",
    {
      headers: { Origin: appOrigin },
      data: {
        name: "Workspace collaborator",
        email,
        password: "A real workspace browser passphrase!",
      },
    },
  );
  expect(response.ok()).toBe(true);
  await page.goto(await emailLink(email, "Verify"));
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByText("Your email is verified. Your workspace is ready."),
  ).toBeVisible();
  return email;
}
test.describe("workspace collaboration and private branding", () => {
  test.use({ hostAccount: false });
  test("verified collaborators share boards, manage a real Brand Kit, preview securely and retain guest play", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await account(page);
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Good company. Your call." }),
    ).toBeVisible();
    const personalUrl = page.url();
    await page.goto("/app/workspaces/new");
    await page.getByLabel("Workspace name").fill("The shared test room");
    await page.getByRole("button", { name: "Create shared workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "The shared test room", exact: true }),
    ).toBeVisible();
    const workspaceUrl = page.url(),
      workspaceId = workspaceUrl.split("/").at(-1)!;
    await page.goto(workspaceUrl + "/studio");
    await page.getByRole("button", { name: "Make it mine" }).first().click();
    await expect(page.getByLabel("Board title")).toBeVisible();
    await page.getByLabel("Board title").fill("Everyone’s Friday board");
    await expect(page.locator('.studio-editor-top [role="status"]')).toHaveText(
      "Saved to workspace",
    );
    const boardUrl = page.url();
    const contextB = await browser.newContext(),
      other = await contextB.newPage();
    const emailB = await account(other);
    await other.goto(workspaceUrl);
    await expect(
      other.getByRole("heading", { name: "Workspace unavailable." }),
    ).toBeVisible();
    await page.goto(workspaceUrl + "/members");
    await page.getByLabel("Email address", { exact: true }).fill(emailB);
    await page
      .getByRole("combobox", { name: "Workspace role", exact: true })
      .selectOption("host");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Invitation email sent",
    );
    await other.goto(await emailLink(emailB, "Join"));
    await other.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      other.getByRole("heading", { name: "The shared test room", exact: true }),
    ).toBeVisible();
    await other.goto(boardUrl);
    await expect(other.getByLabel("Board title")).toHaveValue(
      "Everyone’s Friday board",
    );
    await other.getByLabel("Board title").fill("A board we made together");
    await expect(
      other.locator('.studio-editor-top [role="status"]'),
    ).toHaveText("Saved to workspace");
    await page.goto(boardUrl);
    await expect(page.getByLabel("Board title")).toHaveValue(
      "A board we made together",
    );
    await page.goto(workspaceUrl + "/brand");
    await page.getByRole("link", { name: "Create Brand Kit" }).click();
    await page
      .getByLabel("Brand Kit name", { exact: true })
      .fill("Room signature");
    await page
      .getByLabel("Display name", { exact: true })
      .fill("The shared test room");
    await page.locator("#brand-primaryColor").fill("#2255AA");
    const image = await sharp({
      create: { width: 100, height: 60, channels: 4, background: "#f8c739" },
    })
      .png()
      .toBuffer();
    await page.locator("#upload-logo").setInputFiles({
      name: "room-logo.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Logo uploaded" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save Brand Kit" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/w/${workspaceId}/brand/[0-9a-f-]+$`),
    );
    const brandUrl = page.url();
    await page.reload();
    await expect(
      page.getByLabel("Brand Kit name", { exact: true }),
    ).toHaveValue("Room signature");
    await expect(page.locator("#brand-primaryColor")).toHaveValue("#2255AA");
    await expect(
      page.getByRole("img", { name: "The shared test room logo" }),
    ).toBeVisible();
    let sockets = 0;
    page.on("request", (r) => {
      if (r.url().includes("socket.io")) sockets++;
    });
    for (const name of ["Lobby", "Join / QR", "Leaderboard", "Winner"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(
        page.getByText("Powered by Ruckus", { exact: true }),
      ).toBeVisible();
    }
    expect(sockets).toBe(0);
    await other.goto(brandUrl);
    await expect(
      other.getByLabel("Brand Kit name", { exact: true }),
    ).toHaveValue("Room signature");
    await expect(
      other.getByRole("button", { name: "Save Brand Kit" }),
    ).toHaveCount(0);
    const kits = await (
      await other.request.get(`/api/v1/workspaces/${workspaceId}/brand-kits`)
    ).json();
    const assetId = kits.items[0].config.logoAssetId;
    const anonymous = await browser.newContext(),
      guest = await anonymous.newPage();
    expect(
      (
        await guest.request.get(
          appOrigin +
            `/api/v1/workspaces/${workspaceId}/brand-assets/${assetId}`,
        )
      ).status(),
    ).toBe(401);
    await guest.goto(appOrigin + "/join");
    await expect(guest.getByLabel("Room code")).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const suffix of ["/members", brandUrl.replace(workspaceUrl, "")]) {
        await page.goto(workspaceUrl + suffix);
        await expect(page.locator("main h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${suffix} at ${width}`,
        ).toBe(true);
      }
      await page
        .getByRole("button", { name: "The shared test room ▾", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Choose workspace" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "The shared test room ▾", exact: true })
        .click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const url of [workspaceUrl + "/members", brandUrl]) {
      await page.goto(url);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await page.screenshot({
      path: "test-results/phase-2/brand-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/phase-2/brand-mobile.png",
      fullPage: true,
    });
    await page.goto(personalUrl);
    await expect(
      page.getByRole("heading", { name: "Your first board starts here." }),
    ).toBeVisible();
    await other.goto(boardUrl);
    await other
      .getByRole("button", { name: "Play this board", exact: true })
      .click();
    await expect(other.locator(".host-code b")).toBeVisible();
    const code = await other.locator(".host-code b").textContent();
    await guest.goto(appOrigin + `/join?room=${code}`);
    await guest.getByLabel("What should we call you?").fill("Workspace Guest");
    await guest.getByRole("button", { name: "I’m in. Let’s go." }).click();
    await expect(
      guest.getByRole("heading", { name: "Workspace Guest, you’re in." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await contextB.close();
    await anonymous.close();
  });
});
