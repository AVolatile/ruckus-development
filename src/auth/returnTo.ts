export function safeReturnTo(value: string | null | undefined) {
  if (
    !value ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) <= 32) ||
    !value.startsWith("/app") ||
    !/^\/app(?:[/?#]|$)/.test(value)
  )
    return "/app";
  try {
    const url = new URL(value, "https://ruckus.invalid");
    return url.origin === "https://ruckus.invalid" &&
      /^\/app(?:\/|$)/.test(url.pathname)
      ? url.pathname + url.search + url.hash
      : "/app";
  } catch {
    return "/app";
  }
}
