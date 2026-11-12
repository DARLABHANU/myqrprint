import { renderPrintPayload } from './ui/print';

if (new URLSearchParams(window.location.search).has('print')) {
  document.body.classList.add('print-mode');
  window.printly?.onPrintPayload((payload) => {
    void renderPrintPayload(payload)
      .then(() => window.printly.printReady(payload.id))
      .catch((error) =>
        window.printly.printReady(payload.id, error instanceof Error ? error.message : 'Could not render files.')
      );
  });
}
