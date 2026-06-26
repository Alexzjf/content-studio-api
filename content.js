/**
 * Insert generated post text into X/Twitter compose box (preserves line breaks and spaces).
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "INSERT_TWEET") {
    return false;
  }

  try {
    insertTweetText(message.text);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ error: err.message });
  }
  return true;
});

function findTweetEditor() {
  return (
    document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]') ||
    document.querySelector('[data-testid="tweetTextarea_0"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  );
}

function insertTweetText(text) {
  const editor = findTweetEditor();
  if (!editor) {
    throw new Error("Не знайдено поле для поста. Відкрийте x.com і натисніть «Що нового?»");
  }

  const normalized = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  editor.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  try {
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
  } catch {
    editor.innerHTML = "";
  }

  let inserted = false;
  try {
    const data = new DataTransfer();
    data.setData("text/plain", normalized);
    inserted = editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
  } catch {
    inserted = false;
  }

  if (!inserted || !editor.textContent) {
    editor.innerHTML = "";
    const lines = normalized.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) editor.appendChild(document.createElement("br"));
      if (lines[i].length) editor.appendChild(document.createTextNode(lines[i]));
    }
  }

  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
      data: normalized,
    })
  );
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}
