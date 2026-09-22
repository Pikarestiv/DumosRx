/**
 * Prints a single DOM node in isolation via a hidden iframe, instead of
 * printing the whole page and hiding everything else with CSS. The iframe
 * gets its own document containing only the cloned node plus the app's
 * compiled stylesheets, so Tailwind classes render correctly but nothing
 * else on the page (sidebar, dialogs, other components) is ever at risk of
 * bleeding into the printed output or needing a print:hidden escape hatch.
 */
const STYLESHEET_READY_TIMEOUT_MS = 3000;

/** Resolves once every external stylesheet in `doc` has either loaded or
 * failed, or after the timeout — whichever comes first. Doesn't depend on
 * the iframe's own `onload`, which may already have fired for the initial
 * `about:blank` document (never firing again for the `doc.write()`d one) or
 * may never fire at all in some browsers for a document written this way. */
function waitForStylesheets(doc: Document): Promise<void> {
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
  if (links.length === 0) return Promise.resolve();

  const loaded = Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if ((link as HTMLLinkElement).sheet) {
            resolve();
            return;
          }
          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);

  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, STYLESHEET_READY_TIMEOUT_MS),
  );

  return Promise.race([loaded, timeout]);
}

/** Returns once the print dialog has been invoked, or rejects if the node
 * couldn't be printed (no iframe document/window access). Always removes the
 * iframe afterward, so a failure never leaks it. */
export function printNode(node: HTMLElement, pageStyle?: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 500);
  };

  const doc = iframe.contentDocument;
  if (!doc) {
    cleanup();
    return Promise.reject(new Error("Could not access print iframe document."));
  }

  const styles = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((el) => el.outerHTML)
    .join("\n");

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        ${styles}
        <style>${pageStyle || ""}</style>
      </head>
      <body>${node.outerHTML}</body>
    </html>
  `);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    cleanup();
    return Promise.reject(new Error("Could not access print iframe window."));
  }

  return waitForStylesheets(doc)
    .then(() => {
      win.focus();
      win.print();
    })
    .finally(cleanup);
}
