import { test, expect, appOrigin } from "./fixtures";
import { randomUUID } from "node:crypto";
import { TEMPLATES } from "../../shared/content/library";

test.describe("real account vertical slice", () => {
  test.use({ hostAccount: false });
  test("signup, local import, cloud save, logout/login, second browser and guest launch", async ({
    page,
    browser,
  }) => {
    test.setTimeout(100000);
    const email = `cloud-${randomUUID()}@example.test`,
      password = "My real browser test passphrase!";
    const local = structuredClone(TEMPLATES[1]);
    local.id = randomUUID();
    local.title = "My pre-account board";
    const original = JSON.stringify([local]);
    await page.addInitScript(
      ({ original }) => {
        if (!localStorage.getItem("ruckus-studio-v1"))
          localStorage.setItem("ruckus-studio-v1", original);
      },
      { original },
    );
    await page.goto("/app/studio");
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page
      .getByRole("link", { name: "New here? Create an account" })
      .click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page).toHaveURL(/\/app\/studio$/);
    const cookies = await page.context().cookies();
    expect(
      cookies.some(
        (cookie) =>
          cookie.name.includes("ruckus.session_token") &&
          cookie.httpOnly &&
          cookie.sameSite === "Lax",
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Import local boards", exact: true })
      .click();
    await expect(
      page.getByText(
        "1 saved to your account. 0 need attention. Local originals are unchanged.",
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("ruckus-studio-v1")),
    ).toBe(original);
    await page.getByRole("button", { name: "Retry import safely" }).click();
    await expect(page.locator(".board-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Not now", exact: true }).click();
    await page
      .getByRole("button", { name: "Create question board", exact: true })
      .click();
    await expect(page.getByLabel("Board title")).toBeVisible();
    await page.getByLabel("Board title").fill("A cloud board worth keeping");
    await page
      .getByLabel("Give the room a question", { exact: true })
      .fill("Which answer is cloud-shaped?");
    for (const [index, answer] of [
      "Cloud",
      "Rock",
      "Spoon",
      "Pencil",
    ].entries())
      await page
        .getByLabel(`Answer ${"ABCD"[index]}`, { exact: true })
        .fill(answer);
    await page.getByLabel("Mark answer A correct").check();
    await expect(page.locator('.studio-editor-top [role="status"]')).toHaveText(
      "Saved to your account",
      { timeout: 10000 },
    );
    const editorUrl = page.url(),
      id = editorUrl.split("/").at(-1)!;
    await page.reload();
    await expect(page.getByLabel("Board title")).toHaveValue(
      "A cloud board worth keeping",
    );
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(
      await page.evaluate(() => localStorage.getItem("ruckus-studio-v1")),
    ).toBe(original);
    await page.goto(editorUrl);
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Board title")).toHaveValue(
      "A cloud board worth keeping",
    );
    const second = await browser.newContext(),
      other = await second.newPage();
    await other.goto(
      appOrigin +
        "/login?returnTo=" +
        encodeURIComponent("/app/studio/boards/" + id),
    );
    await other.getByLabel("Email", { exact: true }).fill(email);
    await other.getByLabel("Password", { exact: true }).fill(password);
    await other.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(other.getByLabel("Board title")).toHaveValue(
      "A cloud board worth keeping",
    );
    await other.getByLabel("Board title").fill("Updated from another browser");
    await expect(
      other.locator('.studio-editor-top [role="status"]'),
    ).toHaveText("Saved to your account");
    await page.reload();
    await expect(page.getByLabel("Board title")).toHaveValue(
      "Updated from another browser",
    );
    await page
      .getByRole("button", { name: "Play this board", exact: true })
      .click();
    await expect(page.locator(".host-code b")).toBeVisible();
    const code = await page.locator(".host-code b").textContent();
    await expect(
      page.getByRole("navigation", { name: "Host navigation", exact: true }),
    ).toHaveCount(0);
    const guest = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      phone = await guest.newPage();
    await phone.goto(appOrigin + `/join?room=${code}`);
    await phone.getByLabel("What should we call you?").fill("Cloud Guest");
    await phone.getByRole("button", { name: "I’m in. Let’s go." }).click();
    await expect(
      phone.getByRole("heading", { name: "Cloud Guest, you’re in." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "+ 4 demo players", exact: true })
      .click();
    await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
    await page.getByRole("button", { name: "We’re ready" }).click();
    await expect(
      phone.getByRole("button", { name: "A Cloud", exact: true }),
    ).toBeVisible();
    await phone.getByRole("button", { name: "A Cloud", exact: true }).click();
    await expect(
      phone.getByRole("heading", { name: "Locked. Loaded. Lovely." }),
    ).toBeVisible();
    await second.close();
    await guest.close();
  });
});

test("stale browser edits show conflict and preserve both versions; failed saves never claim success", async ({
  page,
  context,
}) => {
  test.setTimeout(45000);
  await page.goto("/app/studio/boards/new");
  await expect(page.getByLabel("Board title")).toBeVisible();
  await page.getByLabel("Board title").fill("Initial cloud version");
  await expect(page.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Saved to your account",
  );
  const url = page.url(),
    second = await context.newPage();
  await second.goto(url);
  await expect(second.getByLabel("Board title")).toHaveValue(
    "Initial cloud version",
  );
  await page.getByLabel("Board title").fill("Newer committed version");
  await expect(page.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Saved to your account",
  );
  await second.getByLabel("Board title").fill("My conflicting draft");
  await expect(second.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Conflict detected",
  );
  await expect(second.getByLabel("Board title")).toHaveValue(
    "My conflicting draft",
  );
  const download = second.waitForEvent("download");
  await second.getByRole("button", { name: "Export my current draft" }).click();
  expect((await download).suggestedFilename()).toContain("unsaved-draft");
  await second
    .getByRole("button", { name: "Load latest and replace these edits" })
    .click();
  await expect(second.getByLabel("Board title")).toHaveValue(
    "Newer committed version",
  );
  await second.route("**/api/v1/boards/*", async (route) => {
    if (route.request().method() === "PUT") await route.abort();
    else await route.continue();
  });
  await second.getByLabel("Board title").fill("Unsaved offline work");
  await expect(second.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Save failed",
  );
  await expect(second.getByLabel("Board title")).toHaveValue(
    "Unsaved offline work",
  );
  second.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await second.reload();
  await expect(second.getByLabel("Board title")).toHaveValue(
    "Unsaved offline work",
  );
  await expect(second.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Save failed",
  );
  await second.unroute("**/api/v1/boards/*");
  await second.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(second.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Saved to your account",
  );
  await second.reload();
  await expect(second.getByLabel("Board title")).toHaveValue(
    "Unsaved offline work",
  );
  await second.close();
});

test("account B cannot render a guessed private board URL", async ({
  page,
  browser,
}) => {
  await page.goto("/app/studio/boards/new");
  await expect(page.getByLabel("Board title")).toBeVisible();
  const boardUrl = page.url();
  const contextB = await browser.newContext(),
    other = await contextB.newPage();
  const signup = await other.request.post(
    appOrigin + "/api/auth/sign-up/email",
    {
      headers: { Origin: appOrigin },
      data: {
        email: `other-${randomUUID()}@example.test`,
        name: "Other host",
        password: "Other host test passphrase!",
      },
    },
  );
  expect(signup.ok()).toBe(true);
  await other.goto(boardUrl);
  await expect(
    other.getByRole("heading", { name: "That board isn’t available." }),
  ).toBeVisible();
  await expect(other.getByLabel("Board title")).toHaveCount(0);
  await contextB.close();
});

test("edits made while a save is in flight wait for their own acknowledgement", async ({
  page,
}) => {
  await page.goto("/app/studio/boards/new");
  await expect(page.getByLabel("Board title")).toBeVisible();
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/api/v1/boards/*", async (route) => {
    if (route.request().method() === "PUT") {
      writes++;
      if (writes === 1) await held;
    }
    await route.continue();
  });
  await page.getByLabel("Board title").fill("First in-flight title");
  await expect(page.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Saving…",
  );
  await page.getByLabel("Board title").fill("The latest title");
  await expect(
    page.locator('.studio-editor-top [role="status"]'),
  ).not.toHaveText("Saved to your account");
  release();
  await expect(page.locator('.studio-editor-top [role="status"]')).toHaveText(
    "Saved to your account",
  );
  expect(writes).toBe(2);
  await page.reload();
  await expect(page.getByLabel("Board title")).toHaveValue("The latest title");
});
