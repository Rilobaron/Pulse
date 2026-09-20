import type { NotificationChannelType } from '@pulse/shared';
import { discordProvider } from './discordProvider.js';
import { webhookProvider } from './webhookProvider.js';
import { renderIncidentEmail } from './email/emailProvider.js';
import { smtpEmailProvider } from './email/smtpEmailProvider.js';
import type { NotificationMessage, NotificationProvider, NotificationTarget } from './types.js';

export const providersByType: Record<NotificationChannelType, NotificationProvider> = {
  DISCORD: discordProvider,
  WEBHOOK: webhookProvider,
  EMAIL: {
    async send(target: NotificationTarget, message: NotificationMessage): Promise<void> {
      const rendered = renderIncidentEmail(message);
      await smtpEmailProvider.send({ ...rendered, to: target.email ?? '' });
    },
  },
};

/** Single entry point used by the notification worker. */
export async function sendToChannel(
  target: NotificationTarget,
  message: NotificationMessage,
): Promise<void> {
  const provider = providersByType[target.type];
  if (!provider) {
    throw new Error(`Unsupported notification channel type: ${target.type}`);
  }
  await provider.send(target, message);
}

export { discordProvider, webhookProvider, smtpEmailProvider };
export * from './types.js';
