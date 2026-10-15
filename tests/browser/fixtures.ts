import { test as base, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
export const appOrigin =
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4310";
export const test = base.extend<{ hostAccount: boolean; signedIn: void }>({
  hostAccount: [true, { option: true }],
  signedIn: [
    async ({ page, hostAccount }, use) => {
      if (hostAccount) {
        const signup = () =>
          page.request.post("/api/auth/sign-up/email", {
            headers: { Origin: appOrigin },
            data: {
              email: `browser-${randomUUID()}@example.test`,
              name: "Browser host",
              password: "A browser test passphrase!",
            },
          });
        let response = await signup();
        if (response.status() === 429) {
          const retryAfter = Math.min(
            60,
            Math.max(1, Number(response.headers()["retry-after"]) || 60),
          );
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000),
          );
          response = await signup();
        }
        expect(
          response.ok(),
          `Real test host signup (${response.status()})`,
        ).toBe(true);
      }
      await use();
    },
    { auto: true, timeout: 90000 },
  ],
});
export { expect };
