/**
 * Prints a single DOM node in isolation via a hidden iframe, instead of
 * printing the whole page and hiding everything else with CSS. The iframe
 * gets its own document containing only the cloned node plus the app's
 * compiled stylesheets, so Tailwind classes render correctly but nothing
 * else on the page (sidebar, dialogs, other components) is ever at risk of
 * bleeding into the printed output or needing a print:hidden escape hatch.
 */
export function printNode(node: HTMLElement, pageStyle?: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
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

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 500);
  };

  const win = iframe.contentWindow;
  if (!win) {
    cleanup();
    return;
  }

  // Give the stylesheets a moment to apply before printing — onload fires
  // once the HTML is parsed, not once external stylesheet links resolve.
  iframe.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 300);
  };
}
