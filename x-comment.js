/**
 * cheatXtwitter — semi-auto reply on X posts (analyze → draft → user publishes).
 */
(function () {
  const BTN_CLASS = "csx-comment-btn";
  const INJECTED_ATTR = "data-csx-comment";
  const MAX_IMAGES = 2;
  const MAX_VIDEO_BYTES = 28 * 1024 * 1024;

  const STR = {
    uk: {
      btn: "cheatX",
      analyzing: "Аналіз…",
      done: "Коментар вставлено в X ✓",
      errNoPost: "Не вдалося прочитати текст поста.",
      errNoEditor: "Не знайдено поле відповіді. Спробуйте ще раз.",
      errInsert: "Коментар не вставився. Клікніть у поле відповіді й натисніть cheatX знову.",
      errGeneric: "Не вдалося згенерувати коментар.",
      errExt: "Перезавантажте розширення cheatXtwitter.",
    },
    en: {
      btn: "cheatX",
      analyzing: "Analyzing…",
      done: "Comment inserted into X ✓",
      errNoPost: "Could not read post text.",
      errNoEditor: "Reply field not found. Try again.",
      errInsert: "Comment was not inserted. Click the reply field and try cheatX again.",
      errGeneric: "Failed to generate comment.",
      errExt: "Reload the cheatXtwitter extension.",
    },
  };

  let uiLang = "uk";
  let activeEditor = null;
  let commentPrefs = {
    enabled: true,
    analyzeVideo: true,
    analyzeImages: true,
  };

  function t(key) {
    return (STR[uiLang] || STR.uk)[key] || STR.uk[key] || key;
  }

  function detectLang() {
    const html = document.documentElement.lang || "";
    if (html.toLowerCase().startsWith("en")) return "en";
    return "uk";
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitFor(predicate, timeoutMs = 6000, stepMs = 120) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const value = predicate();
      if (value) return value;
      await wait(stepMs);
    }
    return null;
  }

  function showToast(message, isError = false) {
    let el = document.getElementById("csx-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "csx-toast";
      el.className = "csx-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.add("visible");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("visible"), 4200);
  }

  function extractAuthor(article) {
    const link =
      article.querySelector('[data-testid="User-Name"] a[href^="/"]') ||
      article.querySelector('[data-testid="User-Names"] a[href^="/"]');
    if (!link) return "";
    const href = link.getAttribute("href") || "";
    const m = href.match(/^\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  function extractPostText(article) {
    const nodes = article.querySelectorAll('[data-testid="tweetText"]');
    if (!nodes.length) return "";
    return Array.from(nodes)
      .map((n) => n.innerText || n.textContent || "")
      .join("\n")
      .trim();
  }

  function extractImageUrls(article) {
    const urls = new Set();
    article.querySelectorAll('img[src*="pbs.twimg.com"]').forEach((img) => {
      const src = img.currentSrc || img.src;
      if (src && !src.includes("profile_images") && !src.includes("emoji")) {
        urls.add(src.replace(/&name=\w+$/, "&name=large"));
      }
    });
    return [...urls].slice(0, MAX_IMAGES);
  }

  function getVideoSrc(article) {
    const video = article.querySelector("video");
    if (!video) return "";
    return video.currentSrc || video.src || "";
  }

  async function blobToJpegBase64(blob, maxSide = 1024) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    return dataUrl.split(",")[1];
  }

  async function describeImageUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`image ${res.status}`);
    const blob = await res.blob();
    const base64 = await blobToJpegBase64(blob);
    const resp = await chrome.runtime.sendMessage({
      type: "DESCRIBE_IMAGE",
      imageBase64: base64,
    });
    if (resp?.error) throw new Error(resp.error);
    return resp?.text?.trim() || "";
  }

  async function transcribeVideoSrc(src) {
    if (!src || src.includes(".m3u8")) {
      return { skipped: true, note: "Video (streaming) — transcript unavailable." };
    }
    const res = await fetch(src);
    if (!res.ok) throw new Error(`video ${res.status}`);
    const blob = await res.blob();
    if (blob.size > MAX_VIDEO_BYTES) {
      return { skipped: true, note: "Video too long for local transcript." };
    }
    if (typeof extractAudioFromFile !== "function") {
      return { skipped: true, note: "Video present — audio module not loaded." };
    }
    const file = new File([blob], "post-video.mp4", { type: blob.type || "video/mp4" });
    const audio = await extractAudioFromFile(file);
    if (!audio?.length) {
      return { skipped: true, note: "Video has no decodable audio." };
    }
    const resp = await chrome.runtime.sendMessage({ type: "PUT_AUDIO_TRANSCRIBE", audio });
    if (resp?.error) throw new Error(resp.error);
    return { text: (resp?.text || "").trim() };
  }

  async function collectSources(article) {
    const sources = [];
    const notes = [];

    const postText = extractPostText(article);
    if (postText) {
      sources.push({ type: "text", name: "X post", content: postText });
    }

    const imageUrls = commentPrefs.analyzeImages ? extractImageUrls(article) : [];
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const description = await describeImageUrl(imageUrls[i]);
        if (description) {
          sources.push({
            type: "image",
            name: `Post image ${i + 1}`,
            content: description,
          });
        }
      } catch {
        notes.push(`Image ${i + 1}: description failed.`);
      }
    }

    const videoSrc = commentPrefs.analyzeVideo ? getVideoSrc(article) : "";
    if (videoSrc) {
      try {
        const videoResult = await transcribeVideoSrc(videoSrc);
        if (videoResult.text) {
          sources.push({ type: "video", name: "Post video", content: videoResult.text });
        } else if (videoResult.note) {
          notes.push(videoResult.note);
        }
      } catch {
        notes.push("Video: transcription failed.");
      }
    }

    return { sources, postText, notes };
  }

  function getEditorPlainText(editor) {
    return (editor?.innerText || editor?.textContent || "").replace(/\u200b/g, "").trim();
  }

  function isEditorVisible(editor) {
    if (!editor?.isConnected) return false;
    const rect = editor.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = getComputedStyle(editor);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    return rect.bottom > 0 && rect.top < window.innerHeight + 80;
  }

  function findAllEditors() {
    const nodes = document.querySelectorAll(
      '[data-testid^="tweetTextarea"] div[contenteditable="true"][role="textbox"],' +
        '[data-testid^="tweetTextarea"] [contenteditable="true"],' +
        'div[contenteditable="true"][role="textbox"][aria-multiline="true"],' +
        'div.public-DraftEditor-content[contenteditable="true"]'
    );
    return [...new Set(nodes)];
  }

  function findReplyEditor(article) {
    const articleRect = article.getBoundingClientRect();
    const visible = findAllEditors().filter(isEditorVisible);
    if (!visible.length) return null;

    const afterTweet = [];
    let node = article;
    for (let i = 0; i < 12; i++) {
      node = node.nextElementSibling;
      if (!node) break;
      for (const ed of visible) {
        if (node.contains(ed)) afterTweet.push(ed);
      }
    }
    if (afterTweet.length) return afterTweet[0];

    let best = null;
    let bestScore = -Infinity;
    for (const ed of visible) {
      const rect = ed.getBoundingClientRect();
      const below = rect.top >= articleRect.top - 48;
      const distance = Math.abs(rect.top - articleRect.bottom);
      const area = rect.width * rect.height;
      let score = area;
      if (below) score += 12000 - Math.min(distance, 12000);
      score += rect.top * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = ed;
      }
    }
    return best;
  }

  async function fillComposerInPageWorld(text) {
    const resp = await chrome.runtime.sendMessage({ type: "FILL_X_COMPOSER", text });
    if (chrome.runtime.lastError) {
      throw new Error(t("errExt"));
    }
    if (resp?.error) {
      throw new Error(resp.error);
    }
    if (!resp?.ok) {
      throw new Error(t("errInsert"));
    }
    return resp;
  }

  async function openReply(article) {
    let editor = findReplyEditor(article);
    if (editor && isEditorVisible(editor)) {
      return editor;
    }

    const replyBtn = article.querySelector('[data-testid="reply"]');
    if (replyBtn) {
      replyBtn.click();
      await wait(320);
    }

    editor = await waitFor(() => {
      const ed = findReplyEditor(article);
      return ed && isEditorVisible(ed) ? ed : null;
    }, 8000);

    if (!editor) throw new Error(t("errNoEditor"));
    return editor;
  }

  async function ensureReplyEditor(article) {
    const editor = await openReply(article);
    activeEditor = editor;
    return editor;
  }

  async function syncCommentToX(article, comment) {
    await ensureReplyEditor(article);
    const result = await fillComposerInPageWorld(comment);
    activeEditor = findReplyEditor(article);
    if (activeEditor) {
      activeEditor.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return result;
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.title = "cheatXtwitter — згенерувати коментар";
    btn.innerHTML = `<span class="csx-comment-btn-mark">X</span><span class="csx-comment-btn-label">${t("btn")}</span>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const article = btn.closest("article");
      if (article) onCommentClick(article, btn);
    });
    return btn;
  }

  function findActionBar(article) {
    return (
      article.querySelector('[role="group"]') ||
      article.querySelector('[data-testid="reply"]')?.parentElement
    );
  }

  function injectButton(article) {
    if (article.getAttribute(INJECTED_ATTR) === "1") return;
    const bar = findActionBar(article);
    if (!bar) return;
    if (bar.querySelector(`.${BTN_CLASS}`)) {
      article.setAttribute(INJECTED_ATTR, "1");
      return;
    }
    bar.appendChild(createButton());
    article.setAttribute(INJECTED_ATTR, "1");
  }

  function removeAllCommentButtons() {
    document.querySelectorAll(`.${BTN_CLASS}`).forEach((btn) => btn.remove());
    document.querySelectorAll(`article[${INJECTED_ATTR}]`).forEach((a) => a.removeAttribute(INJECTED_ATTR));
  }

  function scanTweets() {
    if (!commentPrefs.enabled) {
      removeAllCommentButtons();
      return;
    }
    document.querySelectorAll('article[data-testid="tweet"]').forEach(injectButton);
  }

  async function loadCommentPrefs() {
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      commentPrefs = {
        enabled: settings.commentModeEnabled !== false,
        analyzeVideo: settings.commentAnalyzeVideo !== false,
        analyzeImages: settings.commentAnalyzeImages !== false,
      };
      if (settings.uiLang === "en" || settings.uiLang === "uk") {
        uiLang = settings.uiLang;
      }
    } catch {
      /* ignore */
    }
  }

  async function onCommentClick(article, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.querySelector(".csx-comment-btn-label");
    const prevLabel = label?.textContent;
    if (label) label.textContent = t("analyzing");

    try {
      const { sources, postText, notes } = await collectSources(article);
      if (!postText && !sources.length) {
        throw new Error(t("errNoPost"));
      }

      const resp = await chrome.runtime.sendMessage({
        type: "GENERATE_COMMENT",
        sources,
        context: {
          author: extractAuthor(article),
          postText,
          note: notes.join(" "),
        },
      });

      if (chrome.runtime.lastError) {
        throw new Error(t("errExt"));
      }
      if (resp?.error) {
        throw new Error(resp.error);
      }
      const comment = (resp?.text || "").trim();
      if (!comment) {
        throw new Error(t("errGeneric"));
      }

      await openReply(article);
      await wait(450);
      await syncCommentToX(article, comment);
      showToast(t("done"));
    } catch (err) {
      showToast(err.message || t("errGeneric"), true);
    } finally {
      btn.disabled = false;
      if (label) label.textContent = prevLabel || t("btn");
    }
  }

  function boot() {
    uiLang = detectLang();
    document.getElementById("csx-publish-bar")?.remove();
    void loadCommentPrefs().then(() => scanTweets());

    const observer = new MutationObserver(() => {
      scanTweets();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      void loadCommentPrefs().then(() => scanTweets());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
