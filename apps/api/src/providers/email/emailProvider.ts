import { env } from '../../config/env.js';
import type { NotificationMessage } from '../types.js';

/**
 * Provider-agnostic email interface. SMTP is the first implementation; adding a
 * different backend (SES, Resend, Postmark…) only requires another implementation
 * of this interface — no changes to the notification pipeline.
 */
export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function renderIncidentEmail(message: NotificationMessage): EmailMessage {
  const { monitor, incident, event } = message;

  if (event === 'MONITOR_TEST') {
    const subject = 'Pulse test notification';
    const text = [
      'Pulse',
      '',
      'This is a test notification from Pulse.',
      '',
      `Channel: ${monitor.name}`,
    ].join('\n');
    return {
      to: '',
      subject,
      text,
      html: wrapHtml(subject, [
        ['p', 'This is a test notification from Pulse.'],
        ['p', `Channel: <strong>${escapeHtml(monitor.name)}</strong>`],
      ]),
    };
  }

  if (event === 'INCIDENT_OPENED') {
    const subject = `Pulse Alert — ${monitor.name} is DOWN`;
    const started = incident ? new Date(incident.startedAt).toUTCString() : message.timestamp;
    const text = [
      'Pulse Alert',
      '',
      `${monitor.name} is DOWN`,
      '',
      'Cause:',
      incident?.cause ?? 'Unknown error',
      '',
      'Started:',
      started,
    ].join('\n');

    return {
      to: '',
      subject,
      text,
      html: wrapHtml('Pulse Alert', [
        ['h1', `${escapeHtml(monitor.name)} is DOWN`],
        ['p', `<strong>Cause:</strong> ${escapeHtml(incident?.cause ?? 'Unknown error')}`],
        ['p', `<strong>Started:</strong> ${escapeHtml(started)}`],
      ]),
    };
  }

  const subject = `Pulse Recovery — ${monitor.name} is operational`;
  const downtime =
    incident?.durationMs != null
      ? `${Math.max(1, Math.round(incident.durationMs / 60000))} minutes`
      : 'unknown';
  const text = [
    'Pulse Recovery',
    '',
    `${monitor.name} is operational again`,
    '',
    'Downtime:',
    downtime,
  ].join('\n');

  return {
    to: '',
    subject,
    text,
    html: wrapHtml('Pulse Recovery', [
      ['h1', `${escapeHtml(monitor.name)} is operational again`],
      ['p', `<strong>Downtime:</strong> ${escapeHtml(downtime)}`],
    ]),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Deliberately simple inline-styled HTML — no template engine needed. */
function wrapHtml(title: string, blocks: Array<[string, string]>): string {
  const body = blocks
    .map(([tag, content]) => `<${tag} style="margin:0 0 12px;font-size:14px;color:#18181b">${content}</${tag}>`)
    .join('');

  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
    <p style="margin:0 0 16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a">Pulse</p>
    <h1 style="margin:0 0 12px;font-size:18px;color:#111827">${escapeHtml(title)}</h1>
    ${body}
    <p style="margin:24px 0 0;font-size:12px;color:#71717a">Sent by Pulse monitoring</p>
  </div>
</body></html>`;
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.smtp.host && env.smtp.from);
}
