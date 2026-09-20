import { describe, expect, it } from 'vitest';
import { isPrivateIp } from '../utils/urlSafety.js';

/**
 * SSRF destination validation — pure IP classification logic.
 * (Network/DNS-dependent paths are covered by integration smoke tests.)
 */
describe('isPrivateIp', () => {
  it('blocks loopback', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('127.5.5.5')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
  });

  it('blocks unspecified addresses', () => {
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('::')).toBe(true);
  });

  it('blocks RFC1918 private ranges', () => {
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.3.4')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.10')).toBe(true);
  });

  it('blocks link-local and cloud metadata', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('169.254.0.1')).toBe(true);
  });

  it('blocks CGNAT, benchmarking and TEST-NET ranges', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('198.18.0.1')).toBe(true);
    expect(isPrivateIp('198.51.100.7')).toBe(true);
    expect(isPrivateIp('203.0.113.9')).toBe(true);
    expect(isPrivateIp('192.0.2.1')).toBe(true);
  });

  it('blocks multicast and reserved', () => {
    expect(isPrivateIp('224.0.0.1')).toBe(true);
    expect(isPrivateIp('255.255.255.255')).toBe(true);
  });

  it('blocks IPv6 ULA / link-local / multicast', () => {
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('ff02::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback/private', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows public IPs', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false); // example.com
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });

  it('treats unrecognized input as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
    expect(isPrivateIp('')).toBe(true);
  });
});
