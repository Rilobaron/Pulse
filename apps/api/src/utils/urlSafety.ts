import dns from 'node:dns/promises';
import ipaddr from 'node:net';
import { BadRequestError } from './errors.js';

/**
 * Centralized destination validation used to prevent SSRF.
 *
 * Applied in two places:
 *  1. When a monitor is created/updated (fail fast with a clear message).
 *  2. Right before every outgoing check (DNS may change after creation — DNS rebinding).
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
]);

const BLOCKED_HOSTNAME_SUFFIXES = ['.internal', '.localhost', '.local', '.lan', '.home.arpa'];

/** Cloud provider metadata endpoints (AWS/GCP/Azure/Oracle). */
const BLOCKED_EXACT_IPS = new Set(['169.254.169.254', '169.254.170.2', 'fd00:ec2::254']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  // Typed as number to avoid TS narrowing the destructured tuple to literals
  // (which breaks chained && comparisons below).
  const a: number = parts[0];
  const b: number = parts[1];

  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 10 || // 10.0.0.0/8 private
    a === 127 || // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 192 && b === 0) || // 192.0.0.0/24 protocol assignments + 192.0.2.0/24 TEST-NET-1
    (a === 198 && (b === 18 || b === 19 || b === 51)) || // 198.18.0.0/15 benchmarking + 198.51.100.0/24 TEST-NET-2
    (a === 203 && b === 0) || // 203.0.113.0/24 TEST-NET-3
    a >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  );
}

function normalizeIPv6(ip: string): string {
  // Strip IPv4-mapped suffix (e.g. "::ffff:127.0.0.1" -> handled by caller first)
  return ip.toLowerCase();
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = normalizeIPv6(ip);

  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe80::')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA fc00::/7
  if (normalized.startsWith('ff')) return true; // multicast ff00::/8
  if (BLOCKED_EXACT_IPS.has(normalized)) return true;

  return false;
}

export function isPrivateIp(ip: string): boolean {
  const cleaned = ip.replace(/^\[|\]$/g, '');

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(cleaned);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  if (ipaddr.isIPv4(cleaned)) return isPrivateIPv4(cleaned);
  if (ipaddr.isIPv6(cleaned)) return isPrivateIPv6(cleaned);

  return true; // Unrecognized format — treat as unsafe
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  // Bare IP-literal hostnames are checked separately via isPrivateIp
  return false;
}

/**
 * Validates that a URL is a safe, public HTTP(S) destination.
 * Throws BadRequestError with a descriptive message when it is not.
 */
export async function assertSafeMonitorUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestError('Invalid URL format');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestError('Only http:// and https:// URLs are supported');
  }

  if (url.username || url.password) {
    throw new BadRequestError('URLs with embedded credentials are not allowed');
  }

  const hostname = url.hostname.toLowerCase();

  if (isBlockedHostname(hostname)) {
    throw new BadRequestError(`Hostname "${hostname}" is not allowed`);
  }

  // If the hostname is an IP literal, validate it directly
  if (ipaddr.isIP(hostname.replace(/^\[|\]$/g, ''))) {
    if (isPrivateIp(hostname)) {
      throw new BadRequestError('Private, loopback and link-local IP addresses are not allowed');
    }
    return url;
  }

  // Resolve DNS and validate every resolved address (DNS rebinding protection)
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new BadRequestError(`Could not resolve hostname "${hostname}"`);
  }

  if (addresses.length === 0) {
    throw new BadRequestError(`Could not resolve hostname "${hostname}"`);
  }

  for (const address of addresses) {
    if (isPrivateIp(address)) {
      throw new BadRequestError(
        `Hostname "${hostname}" resolves to a private or reserved IP address`,
      );
    }
  }

  return url;
}
