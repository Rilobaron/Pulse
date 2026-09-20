import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { NotificationProviderError } from '../types.js';
import type { EmailMessage, EmailProvider } from './emailProvider.js';

/**
 * Minimal transport contract — duck-typed so tests can inject a fake without
 * depending on nodemailer's internal types.
 */
export interface TestableTransport {
  sendMail(mail: {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
}

/**
 * SMTP implementation of the EmailProvider interface.
 * Configuration comes exclusively from the environment; when it is missing the
 * provider reports itself as not configured and the app keeps running normally.
 */
export function createSmtpEmailProvider(injectedTransport?: TestableTransport): EmailProvider {
  let transporter: TestableTransport | Transporter | null = injectedTransport ?? null;

  function getTransporter(): TestableTransport | Transporter {
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.password } } : {}),
    });

    return transporter;
  }

  return {
    name: 'smtp',

    isConfigured(): boolean {
      return Boolean(env.smtp.host && env.smtp.from);
    },

    async send(message: EmailMessage): Promise<void> {
      if (!this.isConfigured()) {
        throw new NotificationProviderError(
          'Email provider is not configured (SMTP_HOST / SMTP_FROM missing)',
          false,
        );
      }

      if (!message.to) {
        throw new NotificationProviderError('Email channel has no destination address', false);
      }

      const transporterInstance = getTransporter();

      try {
        await transporterInstance.sendMail({
          from: env.smtp.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (err) {
        throw new NotificationProviderError(
          err instanceof Error ? err.message : 'SMTP delivery failed',
          true,
        );
      }
    },
  };
}

export const smtpEmailProvider = createSmtpEmailProvider();
