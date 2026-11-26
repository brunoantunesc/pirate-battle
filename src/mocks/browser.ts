import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

// MSW transfers a separate response-body stream for lifecycle observers, even
// for bypassed sound/asset requests. We do not inspect those bodies. Cancel the
// diagnostic copy so its transferred MessagePort does not outlive the request;
// the application's original response remains available to Axios/audio/images.
function releaseDiagnosticResponse({ response }: { response: Response }): void {
  if (!response.body || response.bodyUsed) return;
  void response.body.cancel().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.error(
      "Could not release the mock response diagnostic stream.",
      error,
    );
  });
}
worker.events.on("response:bypass", releaseDiagnosticResponse);
worker.events.on("response:mocked", releaseDiagnosticResponse);

let startup: Promise<void> | undefined;
/** Deliberately enabled for production: this challenge uses a simulated REST service. */
export function initMocks(): Promise<void> {
  startup ??= worker
    .start({ onUnhandledRequest: "bypass", quiet: true })
    .then(() => undefined)
    .catch((error: unknown) => {
      startup = undefined;
      throw error;
    });
  return startup;
}
