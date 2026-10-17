import { isIP } from "node:net";
const loopback = (ip: string) =>
  isIP(ip) !== 0 && (ip === "::1" || /^(?:::ffff:)?127\./i.test(ip));
/** Mirror the explicitly supported loopback proxy policy for native socket upgrades. */
export function socketClientAddress(
  remote: string,
  forwarded: unknown,
  trustProxy: boolean,
) {
  if (
    !trustProxy ||
    !loopback(remote) ||
    typeof forwarded !== "string" ||
    forwarded.length > 512
  )
    return remote;
  const chain = forwarded.split(",").map((value) => value.trim());
  if (chain.length > 10 || chain.some((ip) => !isIP(ip))) return remote;
  let address = remote;
  for (const next of chain.reverse()) {
    if (!loopback(address)) break;
    address = next;
  }
  return address;
}
