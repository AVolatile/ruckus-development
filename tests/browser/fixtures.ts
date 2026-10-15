import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
export const appOrigin =
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4310";
// Respect the real abuse limit for both primary fixtures and second-account contexts.
export async function signupWithRetry(
  request: APIRequestContext,
  data: { email: string; name: string; password: string },
) {
  const signup = () =>
    request.post(appOrigin + "/api/auth/sign-up/email", {
      headers: { Origin: appOrigin },
      data,
    });
  let response = await signup();
  if (response.status() === 429) {
    const seconds = Math.min(
      60,
      Math.max(1, Number(response.headers()["retry-after"]) || 60),
    );
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    response = await signup();
  }
  return response;
}
export const test = base.extend<{ hostAccount: boolean; signedIn: void }>({
  hostAccount: [true, { option: true }],
  signedIn: [
    async ({ page, hostAccount }, use) => {
      if (hostAccount) {
        const response = await signupWithRetry(page.request, {
          email: `browser-${randomUUID()}@example.test`,
          name: "Browser host",
          password: "A browser test passphrase!",
        });
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
