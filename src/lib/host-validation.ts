import { isIP } from 'node:net';

// Names for this computer that are always accepted in the Host and Origin headers
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

// Listen addresses that mean "all interfaces" rather than a name clients would use
const WILDCARD_HOSTS = new Set(['', '0.0.0.0', '::', '[::]']);

/**
 * Lowercase hostname from a Host header or a host list entry, without the port.
 * IPv6 addresses are returned in brackets, as they appear in Host headers and URLs.
 */
export function parseHostname(value: string): string | undefined {
  const host = value.trim().toLowerCase();
  if (!host) {
    return undefined;
  }
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? undefined : host.slice(0, end + 1);
  }
  // A bare IPv6 address (e.g. from --host) has no port to strip
  if (isIP(host) === 6) {
    return `[${host}]`;
  }
  const colon = host.indexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

/** Whether a listen address only accepts connections from this computer. */
export function isLoopbackHost(host: string): boolean {
  const hostname = parseHostname(host);
  return (
    hostname !== undefined && (LOOPBACK_HOSTNAMES.includes(hostname) || hostname.startsWith('127.'))
  );
}

/**
 * Hostnames the HTTP server accepts in the Host and Origin headers: the loopback names, the
 * address it listens on (unless that is a wildcard such as 0.0.0.0), and any comma-separated
 * names in COCO_ALLOWED_HOSTS (set by --allowed-hosts).
 */
export function getAllowedHostnames(
  listenHost: string,
  extraHosts: string | undefined = process.env.COCO_ALLOWED_HOSTS
): Set<string> {
  const allowed = new Set(LOOPBACK_HOSTNAMES);
  const entries = extraHosts ? extraHosts.split(',') : [];
  if (!WILDCARD_HOSTS.has(listenHost.trim())) {
    entries.push(listenHost);
  }
  for (const entry of entries) {
    const hostname = parseHostname(entry);
    if (hostname) {
      allowed.add(hostname);
    }
  }
  return allowed;
}

/**
 * Check a request's Host and Origin headers against the allowed hostnames. This blocks
 * DNS rebinding, where a web page reaches a local server through a domain it controls that
 * resolves to 127.0.0.1. Requests without an Origin header (non-browser clients) only need
 * an allowed Host.
 *
 * @returns Why the request is rejected, or undefined if it is allowed
 */
export function getRequestRejection(
  hostHeader: string | undefined,
  originHeader: string | undefined,
  allowedHostnames: Set<string>
): string | undefined {
  const hostname = hostHeader ? parseHostname(hostHeader) : undefined;
  if (!hostname || !allowedHostnames.has(hostname)) {
    return `Forbidden: Host "${hostHeader ?? ''}" is not allowed. Add it with --allowed-hosts or COCO_ALLOWED_HOSTS to accept it.`;
  }

  if (originHeader !== undefined) {
    let originHostname: string | undefined;
    try {
      originHostname = new URL(originHeader).hostname.toLowerCase();
    } catch {
      // Not a URL (e.g. "null"), so it can't match an allowed hostname
    }
    if (!originHostname || !allowedHostnames.has(originHostname)) {
      return `Forbidden: Origin "${originHeader}" is not allowed.`;
    }
  }

  return undefined;
}
