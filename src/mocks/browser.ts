import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
let startup: Promise<void> | undefined;
/** Deliberately enabled for production: this challenge uses a simulated REST service. */
export function initMocks(): Promise<void> {
  startup ??= worker.start({ onUnhandledRequest: 'bypass', quiet: true }).then(() => undefined).catch((error: unknown) => { startup = undefined; throw error; });
  return startup;
}
