/**
 * Fullscreen settings inside app.html (extension window).
 */
(function () {
  const COMMENT = globalThis.COMMENT_SETTINGS_DEFAULTS || {
    commentModeEnabled: true,
    authorReplyModeEnabled: true,
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
      authorReplyModeEnabled: $("authorReplyModeEnabled")?.checked !== false,
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
    if ($("authorReplyModeEnabled")) $("authorReplyModeEnabled").checked = s.authorReplyModeEnabled !== false;
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

  let checkoutEnabled = false;
  let paymentPollTimer = null;

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
    if (id === "profile") void refreshProfile();
    if (id === "plans") void refreshPlans();
  }

  function planNameKey(id) {
    const map = { free: "planFree", base: "planBase", pro: "planPro", pro_max: "planProMax" };
    return map[id] || "planFree";
  }

  function renderPlanCard(plan, currentPlan, paymentsOn) {
    const isCurrent = plan.id === currentPlan;
    const isPaid = plan.priceUsd > 0;
    const canBuy = isPaid && paymentsOn && !isCurrent;
    const features = [
      t("planRequestsDay").replace("{n}", String(plan.dailyRequests)),
      t("planVideosDay").replace("{n}", String(plan.dailyVideos)),
      plan.authorReplies ? t("planAuthorReplies") : t("planAuthorRepliesNo"),
    ];
    let btnLabel = t("planFree");
    if (isPaid) {
      if (isCurrent) btnLabel = t("planCurrent");
      else if (paymentsOn) btnLabel = t("planBuy");
      else btnLabel = t("planBuySoon");
    } else if (isCurrent) {
      btnLabel = t("planCurrent");
    }
    return `
      <article class="plan-card${isCurrent ? " is-current" : ""}">
        ${isCurrent ? `<span class="plan-card-badge">${t("planCurrent")}</span>` : ""}
        <div class="plan-card-head">
          <h3 class="plan-card-name">${t(planNameKey(plan.id))}</h3>
          <p class="plan-card-price">${plan.priceUsd ? `<strong>$${plan.priceUsd}</strong> ${t("planPerMonth")}` : t("planFree")}</p>
        </div>
        <ul class="plan-card-features">${features.map((f) => `<li>${f}</li>`).join("")}</ul>
        <button type="button" class="btn btn-ghost btn-sm plan-card-btn${canBuy ? " is-buy" : ""}" data-plan-id="${plan.id}" ${canBuy ? "" : "disabled"}>
          ${btnLabel}
        </button>
      </article>`;
  }

  function stopPaymentPoll() {
    if (paymentPollTimer) {
      clearInterval(paymentPollTimer);
      paymentPollTimer = null;
    }
  }

  function startPaymentPoll(paymentId) {
    stopPaymentPoll();
    let attempts = 0;
    paymentPollTimer = setInterval(async () => {
      attempts += 1;
      if (attempts > 40) {
        stopPaymentPoll();
        return;
      }
      try {
        const status = await window.AppAuth?.apiRequest?.(`/billing/payment/${paymentId}`, undefined, "GET");
        if (status?.status === "paid") {
          stopPaymentPoll();
          showStatus(t("planPaymentSuccess"));
          await refreshPlans();
        }
      } catch {
        /* retry */
      }
    }, 5000);
  }

  async function startPlanCheckout(planId, btn) {
    btn.disabled = true;
    showStatus(t("planCheckoutOpening"));
    try {
      const checkout = await window.AppAuth.apiRequest("/billing/checkout", { plan: planId });
      const payUrl = checkout?.checkoutUrl || checkout?.invoiceUrl;
      if (!payUrl) throw new Error(t("planCheckoutError"));
      chrome.tabs.create({ url: payUrl, active: true });
      showStatus(t("planPaymentPending"));
      if (checkout.paymentId) startPaymentPoll(checkout.paymentId);
    } catch (err) {
      showStatus(err.message || t("planCheckoutError"));
    } finally {
      btn.disabled = false;
    }
  }

  function bindPlanCheckout() {
    $("planCards")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".plan-card-btn.is-buy");
      if (!btn || btn.disabled) return;
      const planId = btn.dataset.planId;
      if (!planId) return;
      void startPlanCheckout(planId, btn);
    });
  }

  async function refreshPlans() {
    const usageCard = $("planUsageCard");
    const cardsEl = $("planCards");
    if (!cardsEl) return;

    let usage = null;
    let plans = [];
    try {
      const plansRes = await window.AppAuth?.apiRequest?.("/billing/plans", undefined, "GET");
      plans = plansRes?.plans || [];
      checkoutEnabled = !!(plansRes?.checkoutEnabled ?? plansRes?.cryptoEnabled);
      usage = await window.AppAuth?.apiRequest?.("/billing/usage", undefined, "GET");
    } catch {
      usageCard?.classList.add("hidden");
      cardsEl.innerHTML = `<p class="field-hint">${t("authFailed")}</p>`;
      return;
    }

    const currentPlan = usage?.plan || "free";
    cardsEl.innerHTML = plans.map((p) => renderPlanCard(p, currentPlan, checkoutEnabled)).join("");

    if (!usage || !usageCard) return;
    usageCard.classList.remove("hidden");
    globalThis.AppPlanUsage?.refresh?.();

    const req = usage.requests || {};
    const vid = usage.videos || {};
    const used = Number(req.used || 0);
    const limit = Number(req.limit || 20);
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    const usageText = $("planUsageText");
    if (usageText) {
      const lines = [
        t("planUsageLine").replace("{used}", String(used)).replace("{limit}", String(limit)),
        t("planVideoUsageLine")
          .replace("{used}", String(vid.used || 0))
          .replace("{limit}", String(vid.limit || 0)),
        t("planResetsAt"),
      ];
      if (usage.planExpiresAt && currentPlan !== "free") {
        const exp = new Date(usage.planExpiresAt);
        const dateStr = Number.isNaN(exp.getTime())
          ? usage.planExpiresAt
          : exp.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        lines.push(t("planExpiresOn").replace("{date}", dateStr));
      }
      usageText.textContent = lines.join(" · ");
    }

    const bar = $("planUsageBar")?.parentElement;
    const barFill = $("planUsageBar");
    if (barFill) barFill.style.width = `${pct}%`;
    bar?.classList.toggle("is-full", used >= limit);

    const banner = $("planLimitBanner");
    const limitHit = used >= limit;
    banner?.classList.toggle("hidden", !limitHit);
    if (banner && limitHit) {
      banner.textContent = t("planLimitBanner");
    }
  }

  function providerLabel(code) {
    if (code === "x") return t("profileProviderX");
    if (code === "google") return t("profileProviderGoogle");
    if (code === "telegram") return t("profileProviderTelegram");
    if (code === "email") return t("profileProviderEmail");
    return code || "—";
  }

  function profileInitials(name) {
    const parts = String(name || "?")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  async function refreshProfile() {
    const profile = (await window.AppAuth?.fetchProfile?.()) || (await window.AppAuth?.getUser?.());
    if (!profile) return;

    const name = profile.name || "—";
    const emailText =
      profile.displayEmail ||
      profile.email ||
      (profile.isPlaceholderEmail ? t("profileNoEmail") : profile.recoveryEmailMasked || t("profileNoEmail"));

    if ($("profileName")) $("profileName").textContent = name;
    if ($("profileEmail")) $("profileEmail").textContent = emailText;
    if ($("profileAvatar")) $("profileAvatar").textContent = profileInitials(name);
    if ($("profileProviderBadge")) $("profileProviderBadge").textContent = providerLabel(profile.provider);

    const providers = Array.isArray(profile.providers) ? profile.providers : [];
    const providerNames = providers.length
      ? providers.map((p) => providerLabel(p.provider)).join(" · ")
      : providerLabel(profile.provider);
    if ($("profileProvidersList")) $("profileProvidersList").textContent = providerNames;

    const needsRecovery =
      profile.isPlaceholderEmail ||
      providers.some((p) => p.provider === "x" || p.provider === "telegram");
    const recoveryBlock = $("profileRecoveryBlock");
    recoveryBlock?.classList.toggle("hidden", !needsRecovery);

    const linked = $("profileRecoveryLinked");
    const form = $("profileLinkEmailForm");
    if (profile.hasRecoveryEmail) {
      linked?.classList.remove("hidden");
      form?.classList.add("hidden");
      if (linked) {
        linked.textContent = t("profileRecoveryLinked").replace(
          "{email}",
          profile.recoveryEmailMasked || profile.recoveryEmail || ""
        );
      }
    } else {
      linked?.classList.add("hidden");
      form?.classList.remove("hidden");
    }
  }

  function bindProfileActions() {
    $("profileSignOutBtn")?.addEventListener("click", () => {
      if (!confirm(t("profileSignOutConfirm"))) return;
      void window.AppAuth?.signOut?.();
    });

    $("profileLinkEmailForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("profileRecoveryEmail")?.value?.trim();
      const password = $("profileRecoveryPassword")?.value || "";
      const errEl = $("profileRecoveryError");
      const btn = $("profileLinkEmailBtn");

      errEl?.classList.add("hidden");
      if (!email || password.length < 6) {
        if (errEl) {
          errEl.textContent = t("authFillFields");
          errEl.classList.remove("hidden");
        }
        return;
      }

      btn.disabled = true;
      try {
        await window.AppAuth.linkRecoveryEmail(email, password);
        showStatus(t("profileLinkEmailOk"));
        await refreshProfile();
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || t("authFailed");
          errEl.classList.remove("hidden");
        }
      } finally {
        btn.disabled = false;
      }
    });
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
      "authorReplyModeEnabled",
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
    bindPlanCheckout();
    bindAutosave();
    bindProfileActions();
    if (location.search.includes("settings=1")) open();
  }

  window.AppSettings = { open, close, refresh, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
