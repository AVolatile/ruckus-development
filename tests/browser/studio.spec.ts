import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
test("Studio: create, validation, autosave, reorder, preview, JSON/CSV, duplicate/delete and live launch", async ({
  page,
  browser,
}) => {
  test.setTimeout(70000);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("socket.io")) requests.push(r.url());
  });
  await page.goto("/app/studio");
  await expect(page.getByRole("heading", { name: "My boards." })).toBeVisible();
  assertNoSockets();
  await page
    .getByRole("button", { name: "Create question board", exact: true })
    .click();
  await expect(page.getByLabel("Board title")).toBeVisible();
  await page.getByRole("button", { name: "Play this board" }).click();
  await expect(
    page.getByText("Give your board a title.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Board title")
    .fill("Our exceptionally competitive Friday");
  await page
    .getByLabel("Give the room a question", { exact: true })
    .fill("Which answer comes last?");
  for (const [i, a] of ["First", "Second", "Third", "Last"].entries())
    await page.getByLabel(`Answer ${"ABCD"[i]}`, { exact: true }).fill(a);
  await page.getByLabel("Mark answer D correct").check();
  await page
    .getByLabel("The little fact after the reveal")
    .fill("Last is the final answer.");
  await expect(
    page.locator('.studio-editor-top [role="status"]'),
  ).toContainText("Saved", {
    timeout: 4000,
  });
  await page.reload();
  await expect(page.getByLabel("Board title")).toHaveValue(
    "Our exceptionally competitive Friday",
  );
  await page
    .getByRole("button", { name: "Duplicate question", exact: true })
    .click();
  await page
    .getByLabel("Give the room a question", { exact: true })
    .fill("A second question");
  await page
    .getByRole("button", { name: "Move question up", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Question 1: A second question",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete question", exact: true })
    .click();
  await expect(page.locator(".question-rail nav button")).toHaveCount(1);
  await expect(
    page.locator('.studio-editor-top [role="status"]'),
  ).toContainText("Saved");
  const editor = page.url();
  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Preview reveal" }).click();
  await expect(page.locator(".preview-correct")).toContainText("Last");
  await page.goto(editor);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export board ↗" }).click();
  const download = await downloadPromise;
  const json = await fs.readFile((await download.path())!);
  await page.getByRole("button", { name: "Save & return" }).click();
  await expect(
    page.getByRole("heading", { name: "My boards.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Duplicate board", exact: true })
    .click();
  await expect(page.locator(".board-card")).toHaveCount(2);
  await page
    .locator(".board-card")
    .filter({ hasText: "(copy)" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .locator(".board-card")
    .filter({ hasText: "(copy)" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete board", exact: true }).click();
  await expect(page.locator(".board-card")).toHaveCount(1);
  await page.locator("input[type=file]").setInputFiles({
    name: "board.json",
    mimeType: "application/json",
    buffer: json,
  });
  await expect(page.getByLabel("Board title")).toHaveValue(
    "Our exceptionally competitive Friday",
  );
  await page.getByRole("button", { name: "Save & return" }).click();
  await expect(
    page.getByRole("heading", { name: "My boards.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".board-card")).toHaveCount(2);
  await page.locator("input[type=file]").setInputFiles({
    name: "board.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "question,answer_a,answer_b,correct_answer\nA quick test?,Yes,No,A\n",
    ),
  });
  await expect(page.getByLabel("Board title")).toHaveValue(
    "Imported question board",
  );
  assertNoSockets();
  await page.getByRole("button", { name: "Play this board" }).click();
  await expect(page.locator(".host-code b")).toBeVisible();
  const code = (await page.locator(".host-code b").textContent())!;
  await page
    .getByRole("button", { name: "+ 8 demo players", exact: true })
    .click();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const phone = await context.newPage();
  await phone.goto(`/join?room=${code}`);
  await phone.getByLabel("What should we call you?").fill("Studio Player");
  await phone.getByRole("button", { name: "I’m in. Let’s go." }).click();
  await page.getByRole("button", { name: "Let’s make a ruckus" }).click();
  await page.getByRole("button", { name: "We’re ready" }).click();
  await phone.locator(".player-answer").first().click();
  await expect(page.getByRole("button", { name: "Next →" })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("The room, by the numbers.")).toBeVisible();
  await context.close();
  function assertNoSockets() {
    expect(requests).toEqual([]);
  }
});

test("direct new-board route and immediate preview preserve the latest edits", async ({
  page,
}) => {
  await page.goto("/app/studio/boards/new");
  await expect(page.getByLabel("Board title")).toBeVisible();
  await page.getByLabel("Board title").fill("No waiting around");
  await page
    .getByLabel("Give the room a question")
    .fill("An immediately saved question");
  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No waiting around", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".studio-host-preview h3")).toHaveText(
    "An immediately saved question",
  );
  await page.reload();
  await expect(page.locator(".studio-host-preview h3")).toHaveText(
    "An immediately saved question",
  );
});
