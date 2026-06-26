const LAUNCHER_STRINGS = {
  en: {
    subtitle: "Open workspace to chat with AI",
    half: "Half screen",
    full: "Large window",
    tab: "Tab",
    side: "Side panel",
    hint: "Popup is too small for chat — use one of the options above.",
  },
  uk: {
    subtitle: "Відкрийте робоче вікно для чату з AI",
    half: "Вікно на ½ екрану",
    full: "Велике вікно",
    tab: "Вкладка",
    side: "Бічна панель Chrome",
    hint: "Popup замалий для чату — використовуйте одну з опцій вище.",
  },
};

async function applyLauncherLocale() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  const lang = settings.uiLang || I18n.detectLocale();
  const s = LAUNCHER_STRINGS[lang] || LAUNCHER_STRINGS.en;
  document.documentElement.lang = lang === "uk" ? "uk" : "en";
  $("launcherSubtitle").textContent = s.subtitle;
  $("openHalf").textContent = s.half;
  $("openFull").textContent = s.full;
  $("openTab").textContent = s.tab;
  $("openSide").textContent = s.side;
  $("launcherHint").textContent = s.hint;
}

const $ = (id) => document.getElementById(id);

document.getElementById("openHalf").addEventListener("click", () => open("half"));
document.getElementById("openFull").addEventListener("click", () => open("window"));
document.getElementById("openTab").addEventListener("click", () => open("tab"));
document.getElementById("openSide").addEventListener("click", openSide);

applyLauncherLocale();

async function open(mode) {
  const res = await chrome.runtime.sendMessage({ type: "OPEN_APP", mode });
  if (res?.error) alert(res.error);
  window.close();
}

async function openSide() {
  const win = await chrome.windows.getCurrent();
  const res = await chrome.runtime.sendMessage({
    type: "OPEN_SIDE_PANEL",
    windowId: win.id,
  });
  if (res?.error) {
    await chrome.runtime.sendMessage({ type: "OPEN_APP", mode: "half" });
  }
  window.close();
}
