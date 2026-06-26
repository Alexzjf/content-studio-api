/**
 * Fullscreen settings inside app.html (extension window).
 */
(function () {
  const COMMENT = globalThis.COMMENT_SETTINGS_DEFAULTS || {
    commentModeEnabled: true,
    commentLang: "auto",
    commentMinLen: 50,
    commentMaxLen: 280,
    commentStyle: "sharp",
    commentEmoji: "light",
    commentAnalyzeVideo: true,
    commentAnalyzeImages: true,
    commentEndWithQuestion: false,
    commentCustomInstructions: "",
  };

  const $ = (id) => document.getElementById(id);
  let saveTimer = null;
  let bound = false;

  function t(key) {
    try {
      return window.I18n.t(key);
    } catch {
      return key;
    }
  }

  function applyLocale(lang) {
    const code = window.I18n?.normalizeUiLang?.(lang) || lang || "en";
    window.I18n?.setLocale?.(code);
    window.I18n?.applyPageI18n?.();
    document.documentElement.lang = code;
    window.__uiLang = code;
  }

  function showStatus(text, isError = false) {
    const el = $("settingsStatus");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("error", isError);
  }

  function populateSelect(id, options, selected) {
    const sel = $(id);
    if (!sel) return;
    const prev = selected ?? sel.value;
    sel.innerHTML = "";
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      sel.appendChild(el);
    }
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function bindStaticSelects(settings = {}) {
    populateSelect(
      "settingsUiLang",
      window.I18n?.UI_LANG_OPTIONS?.map((o) => ({ value: o.code, label: o.label })) || [
        { value: "en", label: "English" },
        { value: "uk", label: "Українська" },
      ],
      settings.uiLang
    );

    populateSelect(
      "commentLang",
      [
        { value: "auto", label: t("commentLangAuto") },
        { value: "uk", label: t("postLangUk") },
        { value: "en", label: t("postLangEn") },
        { value: "ru", label: t("commentLangRu") },
        { value: "pl", label: t("commentLangPl") },
        { value: "de", label: t("commentLangDe") },
        { value: "es", label: t("commentLangEs") },
        { value: "fr", label: t("commentLangFr") },
      ],
      settings.commentLang
    );

    populateSelect(
      "commentStyle",
      [
        { value: "sharp", label: t("commentStyleSharp") },
        { value: "friendly", label: t("commentStyleFriendly") },
        { value: "witty", label: t("commentStyleWitty") },
        { value: "expert", label: t("commentStyleExpert") },
        { value: "casual", label: t("commentStyleCasual") },
      ],
      settings.commentStyle
    );

    populateSelect(
      "commentEmoji",
      [
        { value: "none", label: t("emojiNone") },
        { value: "light", label: t("emojiLight") },
        { value: "normal", label: t("emojiNormal") },
      ],
      settings.commentEmoji
    );
  }

  function clampCommentLengths(min, max) {
    let minLen = Math.round(Number(min) || COMMENT.commentMinLen);
    let maxLen = Math.round(Number(max) || COMMENT.commentMaxLen);
    minLen = Math.min(400, Math.max(20, minLen));
    maxLen = Math.min(500, Math.max(80, maxLen));
    if (maxLen < minLen + 20) maxLen = minLen + 20;
    return { minLen, maxLen };
  }

  function readForm() {
    const { minLen, maxLen } = clampCommentLengths($("commentMinLen")?.value, $("commentMaxLen")?.value);
    return {
      uiLang: $("settingsUiLang")?.value || "en",
      commentModeEnabled: $("commentModeEnabled")?.checked !== false,
      commentLang: $("commentLang")?.value || "auto",
      commentMinLen: minLen,
      commentMaxLen: maxLen,
      commentStyle: $("commentStyle")?.value || "sharp",
      commentEmoji: $("commentEmoji")?.value || "light",
      commentAnalyzeVideo: $("commentAnalyzeVideo")?.checked !== false,
      commentAnalyzeImages: $("commentAnalyzeImages")?.checked !== false,
      commentEndWithQuestion: $("commentEndWithQuestion")?.checked === true,
      commentCustomInstructions: $("commentCustomInstructions")?.value?.trim() || "",
    };
  }

  function applyForm(settings) {
    const s = { ...COMMENT, ...settings };
    if ($("settingsUiLang")) $("settingsUiLang").value = s.uiLang || "en";
    if ($("commentModeEnabled")) $("commentModeEnabled").checked = s.commentModeEnabled !== false;
    if ($("commentLang")) $("commentLang").value = s.commentLang || "auto";
    if ($("commentMinLen")) $("commentMinLen").value = String(s.commentMinLen ?? COMMENT.commentMinLen);
    if ($("commentMaxLen")) $("commentMaxLen").value = String(s.commentMaxLen ?? COMMENT.commentMaxLen);
    if ($("commentStyle")) $("commentStyle").value = s.commentStyle || "sharp";
    if ($("commentEmoji")) $("commentEmoji").value = s.commentEmoji || "light";
    if ($("commentAnalyzeVideo")) $("commentAnalyzeVideo").checked = s.commentAnalyzeVideo !== false;
    if ($("commentAnalyzeImages")) $("commentAnalyzeImages").checked = s.commentAnalyzeImages !== false;
    if ($("commentEndWithQuestion")) $("commentEndWithQuestion").checked = s.commentEndWithQuestion === true;
    if ($("commentCustomInstructions")) {
      $("commentCustomInstructions").value = s.commentCustomInstructions || "";
    }
    syncCommentBlockState();
  }

  function syncCommentBlockState() {
    const on = $("commentModeEnabled")?.checked !== false;
    $("commentSettingsBlock")?.classList.toggle("disabled", !on);
  }

  function setActiveSection(section) {
    const id = section || "general";
    document.querySelectorAll(".settings-nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === id);
    });
    document.querySelectorAll(".settings-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === id);
    });
    try {
      sessionStorage.setItem("cx_settings_section", id);
    } catch {
      /* ignore */
    }
  }

  function bindNav() {
    document.querySelectorAll(".settings-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setActiveSection(btn.dataset.section));
    });
  }

  async function saveSettings(patch) {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const next = { ...settings, ...patch };
    await chrome.storage.local.set({ settings: next });
    showStatus(t("settingsSaved"));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => showStatus(""), 2400);
  }

  function bindAutosave() {
    if (bound) return;
    bound = true;

    const ids = [
      "settingsUiLang",
      "commentModeEnabled",
      "commentLang",
      "commentMinLen",
      "commentMaxLen",
      "commentStyle",
      "commentEmoji",
      "commentAnalyzeVideo",
      "commentAnalyzeImages",
      "commentEndWithQuestion",
    ];

    for (const id of ids) {
      const el = $(id);
      if (!el) continue;
      const evt = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, () => {
        if (id === "commentModeEnabled") syncCommentBlockState();
        if (id === "commentMinLen" || id === "commentMaxLen") {
          const { minLen, maxLen } = clampCommentLengths($("commentMinLen")?.value, $("commentMaxLen")?.value);
          if ($("commentMinLen")) $("commentMinLen").value = String(minLen);
          if ($("commentMaxLen")) $("commentMaxLen").value = String(maxLen);
        }
        if (id === "settingsUiLang") {
          const next = el.value;
          applyLocale(next);
          bindStaticSelects(readForm());
          window.AppChrome?.applyUiLang?.(next);
          void saveSettings(readForm());
          return;
        }
        void saveSettings(readForm());
      });
    }

    $("commentCustomInstructions")?.addEventListener("blur", () => void saveSettings(readForm()));
    $("settingsCloseBtn")?.addEventListener("click", () => close());
  }

  async function refresh() {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const lang = settings.uiLang || window.I18n?.detectLocale?.() || "en";
    applyLocale(lang);

    if (typeof globalThis.loadAppSettings === "function") {
      await globalThis.loadAppSettings();
    }

    bindStaticSelects(settings);
    applyForm(settings);

    globalThis.populateOwnProviderSelect?.();
    globalThis.updateAiProviderUI?.();
    window.I18n?.applyPageI18n?.();

    const ver = $("appSettingsVersion");
    if (ver && typeof APP_VERSION !== "undefined") ver.textContent = `v${APP_VERSION}`;
  }

  function open(section) {
    const page = $("appSettingsPage");
    if (!page) return;
    void refresh().then(() => {
      let active = section;
      if (!active) {
        try {
          active = sessionStorage.getItem("cx_settings_section") || "general";
        } catch {
          active = "general";
        }
      }
      setActiveSection(active);
      page.classList.remove("hidden");
      page.setAttribute("aria-hidden", "false");
      document.body.classList.add("settings-open");
    });
  }

  function close() {
    const page = $("appSettingsPage");
    if (!page) return;
    page.classList.add("hidden");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
    showStatus("");
  }

  function init() {
    if (!$("appSettingsPage")) return;
    bindNav();
    bindAutosave();
    if (location.search.includes("settings=1")) open();
  }

  window.AppSettings = { open, close, refresh, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
