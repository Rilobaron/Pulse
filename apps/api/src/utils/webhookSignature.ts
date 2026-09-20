import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-pulse-signature';

/** Generates a new hex signing secret for a generic webhook (32 bytes). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Signs the RAW request body with HMAC-SHA256.
 * The header value uses the `sha256=<hex>` format (same convention as GitHub/Stripe).
 */
export function signWebhookPayload(secret: string, rawBody: string): string {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

/**
 * Constant-time verification helper. Used by tests and documented in the README
 * so consumers can validate incoming Pulse webhooks.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expected = signWebhookPayload(secret, rawBody);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader ?? '', 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
