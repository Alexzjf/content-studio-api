/**
 * Runs in PAGE context (main world). Fills X reply composer via Lexical-compatible paste.
 */
(function () {
  function normalizeText(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  function isDesiredFinalText(actual, target) {
    const a = normalizeText(actual);
    const t = normalizeText(target);
    if (!t) return false;
    if (a === t) return true;
    if (a.length >= t.length * 0.85 && a.includes(t.slice(0, Math.min(40, t.length)))) {
      return true;
    }
    return false;
  }

  function waitOneFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame.call(window, () => resolve());
    });
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findComposerCandidates() {
    const out = [];
    const seen = new Set();

    const push = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(el);
    };

    const byTestid0 = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
    byTestid0.forEach((el) => {
      if (isVisible(el)) push(el);
    });

    document.querySelectorAll('[data-testid^="tweetTextarea"]').forEach((el) => {
      if (isVisible(el)) push(el);
    });

    document.querySelectorAll("article [contenteditable='true']").forEach((el) => {
      if (isVisible(el)) push(el);
    });

    document.querySelectorAll("[contenteditable='true'][role='textbox']").forEach((el) => {
      if (isVisible(el)) push(el);
    });

    out.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return out;
  }

  function editableTargets(root) {
    const list = [];
    if (root.getAttribute("contenteditable") === "true") list.push(root);
    root.querySelectorAll("[contenteditable='true']").forEach((el) => list.push(el));
    if (!list.length) list.push(root);
    return [...new Set(list)];
  }

  function findReplyButton() {
    const buttons = [...document.querySelectorAll('[data-testid="tweetButton"]')];
    return buttons.find((b) => {
      if (b.disabled || b.getAttribute("aria-disabled") === "true") return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function isReplyButtonEnabled() {
    const btn = findReplyButton();
    return !!btn;
  }

  async function tryPasteOnElement(el, target) {
    el.click();
    el.focus();

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const allRange = document.createRange();
      allRange.selectNodeContents(el);
      selection.addRange(allRange);
    }

    let pasteCancelled = false;
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", target);
      pasteCancelled = !el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })
      );
    } catch {
      pasteCancelled = false;
    }

    await waitOneFrame();
    await waitOneFrame();

    const text = el.textContent ?? "";
    return {
      pasteCancelled,
      text,
      handled: pasteCancelled && isDesiredFinalText(text, target),
    };
  }

  async function tryInsertTextOnElement(el, target) {
    el.click();
    el.focus();

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const allRange = document.createRange();
      allRange.selectNodeContents(el);
      selection.addRange(allRange);
    }

    try {
      document.execCommand("delete", false, null);
    } catch {
      /* ignore */
    }

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, target);
    } catch {
      inserted = false;
    }

    await waitOneFrame();

    return {
      inserted,
      text: el.textContent ?? "",
    };
  }

  async function fillXComposer(text) {
    const target = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!target) {
      return { ok: false, error: "empty" };
    }

    const roots = findComposerCandidates();
    if (!roots.length) {
      return { ok: false, error: "no composer" };
    }

    let bestText = "";
    let bestEl = null;

    for (const root of roots) {
      const targets = editableTargets(root);
      for (const el of targets) {
        const pasteResult = await tryPasteOnElement(el, target);
        bestText = pasteResult.text;
        bestEl = el;

        if (pasteResult.handled || isDesiredFinalText(pasteResult.text, target)) {
          break;
        }

        if (normalizeText(pasteResult.text).length < 3) {
          const insertResult = await tryInsertTextOnElement(el, target);
          bestText = insertResult.text;
          if (isDesiredFinalText(insertResult.text, target)) {
            break;
          }
        }
      }

      if (isDesiredFinalText(bestText, target) || isReplyButtonEnabled()) {
        break;
      }
    }

    if (bestEl) {
      bestEl.focus();
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const endRange = document.createRange();
        endRange.selectNodeContents(bestEl);
        endRange.collapse(false);
        selection.addRange(endRange);
      }
    }

    await waitMs(80);

    const finalText = bestEl?.textContent ?? bestText ?? "";
    const btnEnabled = isReplyButtonEnabled();
    const ok =
      isDesiredFinalText(finalText, target) ||
      (normalizeText(finalText).length >= Math.min(20, normalizeText(target).length) && btnEnabled);

    return { ok, btnEnabled, textLen: normalizeText(finalText).length };
  }

  window.__csxFillXComposer = async function (text) {
    let result = await fillXComposer(text);
    if (!result.ok) {
      await waitMs(280);
      result = await fillXComposer(text);
    }
    document.dispatchEvent(new CustomEvent("csx-fill-result", { detail: result }));
    return result;
  };
})();
