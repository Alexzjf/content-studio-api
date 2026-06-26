/**
 * Auth gate: blur workspace until user signs in (cloud API on Render).
 */
(function () {
  const AUTH_STORAGE_KEY = "auth";
  const $ = (id) => document.getElementById(id);

  let readyResolve;
  let isRegisterMode = false;
  let preferredView = "side";
  let unlocking = false;

  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function t(key) {
    try {
      return window.I18n.t(key);
    } catch {
      return key;
    }
  }

  function crmApiBase() {
    const cfg = globalThis.EXTENSION_CONFIG || {};
    const custom = cfg.crmApiUrl?.trim();
    if (custom) return custom.replace(/\/$/, "");
    const hosted = cfg.hostedApiUrl || "https://content-studio-api-1.onrender.com";
    return hosted.replace(/\/$/, "");
  }

  function showError(msg) {
    const el = $("authError");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function showViewStatus(msg, isError = false) {
    const el = $("authViewStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
    el.classList.toggle("error", isError);
  }

  function setBusy(busy) {
    const gate = $("authGate");
    gate?.classList.toggle("auth-busy", busy);
    for (const id of ["authSubmitBtn", "authGoogleBtn", "authTelegramBtn", "authXBtn", "authToggleModeBtn"]) {
      const el = $(id);
      if (el) el.disabled = busy;
    }
    document.querySelectorAll(".auth-view-btn").forEach((btn) => {
      btn.disabled = busy;
    });
  }

  async function getStoredAuth() {
    const data = await chrome.storage.local.get(AUTH_STORAGE_KEY);
    return data[AUTH_STORAGE_KEY] || null;
  }

  async function saveAuth(payload) {
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: payload });
  }

  async function clearAuth() {
    await chrome.storage.local.remove(AUTH_STORAGE_KEY);
  }

  function decodeAccessToken(token) {
    try {
      const body = String(token || "").split(".")[0];
      if (!body) return null;
      const pad = "=".repeat((4 - (body.length % 4)) % 4);
      const json = atob(body.replace(/-/g, "+").replace(/_/g, "/") + pad);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function isTokenValid(token) {
    const payload = decodeAccessToken(token);
    return !!(payload?.sub && payload?.exp && payload.exp > Date.now());
  }

  function hideAuthGate() {
    $("authGate")?.classList.add("hidden");
    $("authGate")?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("auth-locked");
    document.documentElement.classList.remove("auth-locked");
  }

  async function tryRefreshSession(stored) {
    try {
      const res = await fetch(`${crmApiBase()}/auth/refresh`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stored.accessToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) return false;
      const data = await res.json();
      await saveAuth({
        ...stored,
        accessToken: data.accessToken,
        user: data.user,
        provider: data.user?.provider || stored.provider,
        savedAt: Date.now(),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function apiRequest(path, body, method = "POST") {
    let res;
    const headers = { Accept: "application/json" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const token = (await getStoredAuth())?.accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      res = await fetch(`${crmApiBase()}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Failed to fetch");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || `HTTP ${res.status}`;
      throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
    return data;
  }

  function syncSocialUi() {
    const cfg = globalThis.EXTENSION_CONFIG || {};
    const mark = (id, ready) => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle("auth-social-pending", !ready);
      btn.title = ready ? "" : t("authProviderNotConfigured");
    };
    mark("authGoogleBtn", !!cfg.googleClientId);
    mark("authTelegramBtn", !!cfg.telegramBotUsername);
    mark("authXBtn", !!cfg.xClientId);
  }

  async function persistPreferredView() {
    const { settings = {} } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, preferredViewMode: preferredView },
    });
  }

  function setViewPickActive(view) {
    document.querySelectorAll(".auth-view-btn").forEach((btn) => {
      btn.classList.toggle("view-mode-btn-active", btn.dataset.authView === view);
    });
  }

  function bindViewPick() {
    document.querySelectorAll(".auth-view-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = btn.dataset.authView || "side";
        preferredView = view;
        setViewPickActive(view);
        void persistPreferredView();
        void previewPreferredView(view);
      });
    });
  }

  async function previewPreferredView(view) {
    const chromeApi = window.AppChrome;
    if (!chromeApi || !document.body.classList.contains("auth-locked")) return;

    const mode = view || preferredView;
    showError("");
    showViewStatus(t("authViewOpening"));

    try {
      let ok = true;
      if (mode === "window") ok = (await chromeApi.openStandaloneWindow?.()) !== false;
      else if (mode === "fullscreen") ok = (await chromeApi.openFullscreenTab?.()) !== false;
      else if (mode === "side") ok = (await chromeApi.openInTabPanel?.()) !== false;

      if (!ok) {
        const status = document.getElementById("headerStatus")?.textContent;
        showViewStatus(status || t("authViewFailed"), true);
        return;
      }

      const statusKey =
        mode === "window" ? "authViewWindowOk" : mode === "fullscreen" ? "authViewFullOk" : "authViewSideOk";
      showViewStatus(t(statusKey));
    } catch (err) {
      showViewStatus(err.message || t("authViewFailed"), true);
    }
  }

  function setRegisterMode(on) {
    isRegisterMode = on;
    $("authNameField")?.classList.toggle("hidden", !on);
    $("authSubmitBtn").textContent = on ? t("authRegister") : t("authSignIn");
    $("authToggleModeBtn").textContent = on ? t("authHaveAccount") : t("authNoAccount");
    $("authPassword")?.setAttribute("autocomplete", on ? "new-password" : "current-password");
    showError("");
  }

  async function applyPreferredViewMode() {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const mode = settings.preferredViewMode || preferredView || "side";
    preferredView = mode;

    const chromeApi = window.AppChrome;
    if (!chromeApi) return;

    const surface = chromeApi.getSurfaceMode?.();
    if (mode === "window" && surface === "standalone") return;
    if (mode === "fullscreen" && surface === "fullscreen") return;
    if (mode === "side" && (surface === "side" || surface === "dock" || surface === "embed")) return;

    if (mode === "window") await chromeApi.openStandaloneWindow?.();
    else if (mode === "fullscreen") await chromeApi.openFullscreenTab?.();
    else if (mode === "side") await chromeApi.openInTabPanel?.();
  }

  async function unlockApp() {
    if (unlocking) return;
    unlocking = true;
    const gate = $("authGate");
    document.body.classList.add("auth-unlocking");
    document.body.classList.remove("auth-locked");
    document.documentElement.classList.remove("auth-locked");

    await new Promise((r) => setTimeout(r, 520));

    gate?.classList.add("auth-gate-out");
    await new Promise((r) => setTimeout(r, 380));

    gate?.classList.add("hidden");
    gate?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("auth-unlocking");
    window.AppChrome?.setHeaderStatus?.("", "");

    readyResolve?.({ ok: true });
    void applyPreferredViewMode();
  }

  async function completeLogin(data, provider = "email") {
    const user = data.user || {};
    await saveAuth({
      accessToken: data.accessToken,
      user,
      provider: user.provider || provider,
      local: data.local === true,
      savedAt: Date.now(),
    });
    await persistPreferredView();
    startSessionWatch();
    await unlockApp();
  }

  async function loginEmail() {
    const email = $("authEmail")?.value?.trim();
    const password = $("authPassword")?.value || "";
    const name = $("authName")?.value?.trim() || email.split("@")[0] || "User";

    if (!email || !password) throw new Error(t("authFillFields"));
    if (password.length < 6) throw new Error(t("authPasswordShort"));

    const path = isRegisterMode ? "/auth/extension-register" : "/auth/login";
    const body = isRegisterMode ? { name, email, password } : { email, password };
    const data = await apiRequest(path, body);
    await completeLogin(data, "email");
  }

  async function loginGoogle() {
    const clientId = globalThis.EXTENSION_CONFIG?.googleClientId;
    if (!clientId) throw new Error(t("authProviderNotConfigured"));

    const accessToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!token) reject(new Error(t("authCancelled")));
        else resolve(token);
      });
    });

    const data = await apiRequest("/auth/social", { provider: "google", accessToken });
    await completeLogin(data, "google");
  }

  async function loginTelegram() {
    const bot = String(globalThis.EXTENSION_CONFIG?.telegramBotUsername || "")
      .trim()
      .replace(/^@/, "");
    if (!bot) throw new Error(t("authProviderNotConfigured"));

    const apiBase = crmApiBase();
    const redirect = chrome.identity.getRedirectURL("telegram");
    const lang = "en";
    const popupUrl = `${apiBase}/auth/telegram/page?bot=${encodeURIComponent(bot)}&redirect_uri=${encodeURIComponent(redirect)}&lang=${encodeURIComponent(lang)}`;

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: popupUrl, interactive: true }, (url) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!url) reject(new Error(t("authCancelled")));
        else resolve(url);
      });
    });

    const parsed = new URL(responseUrl);
    const payload = parsed.searchParams.get("payload");
    if (!payload) throw new Error(t("authFailed"));
    const telegramAuth = JSON.parse(decodeURIComponent(payload));

    const data = await apiRequest("/auth/social", { provider: "telegram", telegramAuth });
    await completeLogin(data, "telegram");
  }

  async function loginX() {
    const clientId = globalThis.EXTENSION_CONFIG?.xClientId;
    if (!clientId) throw new Error(t("authProviderNotConfigured"));

    const res = await chrome.runtime.sendMessage({
      type: "AUTH_X_OAUTH",
      clientId,
      clientSecret: globalThis.EXTENSION_CONFIG?.xClientSecret || "",
    });
    if (res?.error) throw new Error(res.error);
    if (!res?.accessToken) throw new Error(t("authFailed"));

    const data = await apiRequest("/auth/social", { provider: "x", accessToken: res.accessToken });
    await completeLogin(data, "x");
  }

  async function fetchProfile() {
    const stored = await getStoredAuth();
    if (!stored?.accessToken) return null;
    try {
      const profile = await apiRequest("/auth/me", undefined, "GET");
      await saveAuth({ ...stored, user: profile, provider: profile.provider || stored.provider });
      return profile;
    } catch {
      return stored.user || null;
    }
  }

  async function linkRecoveryEmail(email, password) {
    const data = await apiRequest("/auth/profile/link-email", { email, password });
    const stored = await getStoredAuth();
    const user = data.user || stored?.user;
    await saveAuth({
      ...stored,
      accessToken: data.accessToken || stored?.accessToken,
      user,
      provider: user?.provider || stored?.provider,
      savedAt: Date.now(),
    });
    return user;
  }

  async function getUser() {
    const stored = await getStoredAuth();
    return stored?.user || null;
  }

  async function tryAutoSession() {
    const stored = await getStoredAuth();
    if (!stored?.accessToken) return false;

    if (stored.local || String(stored.accessToken).startsWith("local:")) {
      await clearAuth();
      return false;
    }

    if (!isTokenValid(stored.accessToken)) {
      await clearAuth();
      return false;
    }

    const hasCachedUser = !!(stored.user?.id || stored.user?.name);

    try {
      const res = await fetch(`${crmApiBase()}/auth/me`, {
        headers: { Authorization: `Bearer ${stored.accessToken}` },
      });
      if (res.ok) {
        const user = await res.json();
        await saveAuth({
          ...stored,
          user,
          provider: user.provider || stored.provider,
          savedAt: Date.now(),
        });
        return true;
      }
      if (res.status === 401) {
        if (await tryRefreshSession(stored)) return true;
        if (hasCachedUser) return true;
        await clearAuth();
        return false;
      }
      return hasCachedUser || isTokenValid(stored.accessToken);
    } catch {
      return isTokenValid(stored.accessToken);
    }
  }

  function bindForm() {
    $("authToggleModeBtn")?.addEventListener("click", () => setRegisterMode(!isRegisterMode));

    $("authForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setBusy(true);
      showError("");
      try {
        await loginEmail();
      } catch (err) {
        showError(err.message || t("authFailed"));
      } finally {
        setBusy(false);
      }
    });

    const social = [
      ["authGoogleBtn", loginGoogle],
      ["authTelegramBtn", loginTelegram],
      ["authXBtn", loginX],
    ];
    for (const [id, fn] of social) {
      $(id)?.addEventListener("click", async () => {
        setBusy(true);
        showError("");
        try {
          await fn();
        } catch (err) {
          showError(err.message || t("authFailed"));
        } finally {
          setBusy(false);
        }
      });
    }
  }

  async function init() {
    if (!$("authGate")) {
      readyResolve?.({ ok: true, skipped: true });
      return;
    }

    document.documentElement.classList.add("auth-pending");

    const { settings = {} } = await chrome.storage.local.get("settings");
    preferredView = settings.preferredViewMode || "side";
    const lang = settings.uiLang || window.I18n?.detectLocale?.() || "en";
    window.I18n?.setLocale?.(lang);
    window.I18n?.applyPageI18n?.();
    setViewPickActive(preferredView);
    syncSocialUi();

    bindViewPick();
    bindForm();
    setRegisterMode(false);

    const stored = await getStoredAuth();
    if (stored?.accessToken && isTokenValid(stored.accessToken)) {
      hideAuthGate();
    }

    const authed = await tryAutoSession();
    document.documentElement.classList.remove("auth-pending");

    if (authed) {
      hideAuthGate();
      startSessionWatch();
      readyResolve?.({ ok: true, restored: true });
      return;
    }

    $("authGate")?.classList.remove("hidden");
    $("authGate")?.setAttribute("aria-hidden", "false");
    document.body.classList.add("auth-locked");
    document.documentElement.classList.add("auth-locked");
    window.I18n?.applyPageI18n?.();
  }

  async function forceLogout() {
    try {
      await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) chrome.identity.removeCachedAuthToken({ token }, resolve);
          else resolve();
        });
      });
    } catch {
      /* ignore */
    }
    await clearAuth();
    location.reload();
  }

  async function signOut() {
    await forceLogout();
  }

  function startSessionWatch() {
    let timer = null;
    const tick = async () => {
      const stored = await getStoredAuth();
      if (!stored?.accessToken) return;
      if (!isTokenValid(stored.accessToken)) {
        await forceLogout();
        return;
      }
      try {
        const res = await fetch(`${crmApiBase()}/auth/me`, {
          headers: { Authorization: `Bearer ${stored.accessToken}` },
        });
        if (!res.ok) await forceLogout();
      } catch {
        /* offline */
      }
    };
    const arm = () => {
      clearInterval(timer);
      timer = setInterval(() => void tick(), 8000);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void tick();
    });
    window.addEventListener("focus", () => void tick());
    arm();
  }

  async function getAccessToken() {
    const stored = await getStoredAuth();
    return stored?.accessToken || null;
  }

  window.AppAuth = {
    whenReady: () => readyPromise,
    isAuthenticated: async () => !!(await getStoredAuth())?.accessToken,
    getAccessToken,
    getUser,
    fetchProfile,
    linkRecoveryEmail,
    signOut,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init());
  } else {
    void init();
  }
})();
