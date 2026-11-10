import 'server-only';
import { randomUUID } from 'node:crypto';
import { env } from './env';
import { log, maskPhone } from './log';

/**
 * Sends text messages. Everything that sends (sign-in codes, campaigns) goes through this one interface, so adding the
 * contracted gateway (Alpha SMS, SSL Wireless or BulkSMSBD, decision D-01) means writing one adapter, not touching callers.
 */
export interface SmsProvider {
  readonly name: string;
  /** Returns the gateway's message id. Throws when the gateway refuses or is unreachable. */
  send(to: string, text: string): Promise<{ id: string }>;
}

/**
 * Prints the message on the server instead of sending it, so development never texts a real person.
 * The environment check refuses this provider in production. It prints the whole text on purpose, so a developer
 * running OTP_MODE=sms can read the code from the terminal.
 */
class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  async send(to: string, text: string) {
    log.info('sms.console', { to: maskPhone(to), text });
    return { id: `console-${randomUUID()}` };
  }
}

let provider: SmsProvider | undefined;

export function smsProvider(): SmsProvider {
  if (!provider) {
    switch (env().SMS_PROVIDER) {
      case 'console':
        provider = new ConsoleSmsProvider();
        break;
    }
  }
  return provider as SmsProvider;
}
