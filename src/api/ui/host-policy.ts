import type { IncomingHttpHeaders } from "node:http";

const LOOPBACK_NAMES = ["localhost", "127.0.0.1", "[::1]"] as const;

const HOST_ENTRY = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/;

export function allowedHostsFor(
  port: number,
  callbackUrl: string | undefined,
  extraHosts: string | undefined
): Set<string> {
  const hosts = new Set<string>();
  for (const name of LOOPBACK_NAMES) {
    hosts.add(name);
    hosts.add(`${name}:${port}`);
  }
  if (callbackUrl) {
    hosts.add(new URL(callbackUrl).host.toLowerCase());
  }
  for (const raw of (extraHosts ?? "").split(",")) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (!HOST_ENTRY.test(entry)) {
      throw new Error(`CONTEXTGUARD_ALLOWED_HOSTS contains an invalid host: ${entry}`);
    }
    hosts.add(entry);
  }
  return hosts;
}

const FORWARDING_HEADERS = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip", "cf-connecting-ip"] as const;

export function isForwardedRequest(headers: IncomingHttpHeaders): boolean {
  return FORWARDING_HEADERS.some(name => headers[name] !== undefined);
}
