import { test as base, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
export const appOrigin =
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4310";
export const test = base.extend<{ hostAccount: boolean; signedIn: void }>({
  hostAccount: [true, { option: true }],
  signedIn: [
    async ({ page, hostAccount }, use) => {
      if (hostAccount) {
        const response = await page.request.post("/api/auth/sign-up/email", {
          headers: { Origin: appOrigin },
          data: {
            email: `browser-${randomUUID()}@example.test`,
            name: "Browser host",
            password: "A browser test passphrase!",
          },
        });
        expect(
          response.ok(),
          `Real test host signup (${response.status()})`,
        ).toBe(true);
      }
      await use();
    },
    { auto: true },
  ],
});
export { expect };
