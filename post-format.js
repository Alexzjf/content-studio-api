/**
 * X/Twitter post formatting: **bold** markers → Unicode bold + ⋅ separators for 1:1 paste.
 */
(function () {
  const BOLD = new Map();
  for (let i = 0; i < 26; i++) {
    BOLD.set(String.fromCharCode(65 + i), String.fromCodePoint(0x1d400 + i));
    BOLD.set(String.fromCharCode(97 + i), String.fromCodePoint(0x1d41a + i));
  }
  for (let i = 0; i < 32; i++) {
    const u = 0x410 + i;
    if (u <= 0x42f) BOLD.set(String.fromCharCode(u), String.fromCodePoint(0x1d670 + i));
    const l = 0x430 + i;
    if (l <= 0x44f) BOLD.set(String.fromCharCode(l), String.fromCodePoint(0x1d68a + i));
  }
  for (let i = 0; i < 10; i++) {
    BOLD.set(String(i), String.fromCodePoint(0x1d7ce + i));
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toUnicodeBold(text) {
    return [...String(text || "")]
      .map((ch) => BOLD.get(ch) || ch)
      .join("");
  }

  function normalizeBullets(text) {
    return String(text || "")
      .replace(/^\s*[*\-•]\s+/gm, "⋅ ")
      .replace(/\n\s*[*\-•]\s+/g, "\n⋅ ")
      .replace(/\s+\*\s+/g, " ⋅ ")
      .replace(/(^|\n)\*\s+/g, "$1⋅ ");
  }

  function formatPostForX(raw) {
    let text = normalizeBullets(String(raw || "").trim());
    text = text.replace(/\*\*([^*\n]+)\*\*/g, (_, inner) => toUnicodeBold(inner));
    text = text.replace(/\*\*/g, "");
    return text.trim();
  }

  function renderPostHtml(raw) {
    let safe = escapeHtml(String(raw || "").trim());
    safe = normalizeBullets(safe);
    safe = safe.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*\*/g, "");
    return safe.replace(/\n/g, "<br>");
  }

  async function copyPostToClipboard(raw) {
    const plain = formatPostForX(raw);
    const html = `<div>${renderPostHtml(raw)}</div>`;

    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([plain], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        return true;
      } catch {
        /* fallback */
      }
    }

    try {
      await navigator.clipboard.writeText(plain);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = plain;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } finally {
        ta.remove();
      }
      return ok;
    }
  }

  globalThis.PostFormat = {
    formatPostForX,
    renderPostHtml,
    copyPostToClipboard,
    toUnicodeBold,
    normalizeBullets,
  };
})();
