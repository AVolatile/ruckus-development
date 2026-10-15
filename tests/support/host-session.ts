import { randomUUID } from "node:crypto";
export async function hostCookie(origin: string) {
  const response = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: `socket-${randomUUID()}@example.test`,
      name: "Socket host",
      password: "A long test-only passphrase!",
    }),
  });
  if (!response.ok)
    throw new Error(`Test host signup failed (${response.status}).`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
