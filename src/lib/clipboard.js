export async function copyTextToClipboard(
  text,
  {
    clipboard = globalThis.navigator?.clipboard,
    document = globalThis.document,
  } = {},
) {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // The async API can be denied by browser permissions; try the fallback.
    }
  }

  if (!document?.body || typeof document.execCommand !== "function") {
    throw new Error("clipboard unavailable");
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  try {
    fallback.select();
    if (!document.execCommand("copy")) throw new Error("clipboard unavailable");
  } finally {
    fallback.remove();
  }
}
