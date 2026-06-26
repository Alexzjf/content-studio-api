const LOCALES = {
  en: {
    brandTitle: "cheatXtwitter",
    brandSubtitle: "Smart posts for X",
    sources: "Sources",
    noSources: "No sources yet. Add video, audio, text or images.",
    videoAudio: "Video / audio",
    photo: "Photo / image",
    textFile: "Text file",
    pasteText: "Paste text",
    settings: "Settings",
    uiLang: "Interface language",
    aiSettingsTitle: "AI",
    aiConnectionModeLabel: "How to connect AI",
    aiConnectionShared: "Shared AI assistant",
    aiConnectionOwn: "My own API key",
    aiSharedHint:
      "Shared server for everyone — delays and temporary overload are possible.",
    aiSharedUnavailable: "Shared server temporarily unavailable. Try again later.",
    chatHistoryTooLong: "Chat is too long. Clear chat history (trash icon) and try again.",
    serverWaking: "Waking shared server… first idle request may take ~30–45 s",
    serverReady: "Server ready — sending your message…",
    aiOwnProviderLabel: "AI service",
    ownApiKeyLabel: "API key",
    ownApiKeyPlaceholder: "Paste your API key",
    ownModelLabel: "Model",
    ownApiKeyRequired: "Add your API key in Settings",
    ownApiQuotaExceeded: "{provider}: API quota exceeded. Check billing or switch AI service.",
    ownApiKeyInvalid: "{provider}: invalid API key.",
    ownApiRateLimit: "{provider}: too many requests. Wait a moment.",
    ownApiKeyForProvider: "Paste {provider} API key in Settings below",
    aiKeyReady: "{provider} API key saved — you can chat now",
    aiOwnFlowHint: "Pick any AI service → paste your API key → chat works immediately.",
    testApi: "Test API",
    testApiOk: "API works: {reply}",
    testApiOwnOnly: "Switch to «My own API key» to test your provider",
    aiOnHintOwnProvider: "Uses your {provider} API key directly from the extension.",
    cursorSlowHint:
      "Cursor Cloud Agent: chat works but replies take 30–120 s. Status shows progress.",
    aiOnHintHosted: "Shared server — delays and temporary overload are possible.",
    aiCharacter: "Character / tone",
    assistantLabel: "Assistant",
    stylePunchy: "Punchy / hook-first",
    styleCasual: "Casual",
    styleExpert: "Expert",
    styleStory: "Story / scene",
    styleNews: "News",
    styleMinimal: "Minimal",
    styleSarcastic: "Sarcastic / witty",
    styleMotivational: "Motivational",
    styleProvocative: "Provocative / bold",
    stylePoetic: "Poetic / vivid",
    styleTechnical: "Technical / builder",
    styleDegen: "Degen / crypto-native",
    styleWarm: "Warm / empathetic",
    styleContrarian: "Contrarian reframe",
    postLength: "Post length",
    lengthAuto: "Auto",
    lengthMicro: "Micro (<120 chars)",
    lengthShort: "One tweet",
    lengthMedium: "Medium",
    lengthLong: "Long-form",
    emojiMode: "Emojis",
    emojiNone: "None",
    emojiLight: "Light (0–1)",
    emojiNormal: "Normal (1–3)",
    perspective: "Perspective",
    perspectiveAuto: "Auto",
    perspectiveFirst: "First person (I)",
    perspectiveSecond: "Second person (you)",
    perspectiveThird: "Third person",
    temperature: "Creativity",
    tempLow: "Lower — more precise",
    tempMid: "Medium",
    tempHigh: "Higher — livelier",
    tempMax: "Maximum",
    postLang: "Response language",
    postLangAuto: "Auto (match sources / prompt)",
    postLangEn: "English",
    postLangUk: "Ukrainian",
    whisperLang: "Transcription language (video/audio)",
    whisperAuto: "Auto",
    customRules: "Extra rules",
    customRulesPlaceholder:
      "e.g. first person, no emojis, max 200 characters, practical tone…",
    saveSettings: "Save",
    chat: "Chat",
    tabChat: "Chat",
    tabSources: "Sources",
    tabSettings: "Settings",
    assistantName: "AI Assistant",
    postPreviewHandle: "@your_post",
    postReady: "Draft",
    threadPart: "Part {n}/{total}",
    copy: "Copy",
    insertX: "Insert on X",
    draftLabel: "Your post",
    draftPlaceholder: "Write or paste your post here…",
    chars: "characters",
    chatPlaceholder: "Ask AI anything or generate a post…",
    send: "Send",
    chatEmpty1: "Chat with AI here — no video required.",
    chatEmpty2: "Add sources on the left for posts from video, or just type a question.",
    rateLimitWait: "Assistant is thinking…",
    serverOffline: "Cloud AI is temporarily unavailable. Try again.",
    serverOutdated: "Cloud server needs redeploy (server folder on Render).",
    serverWrongUrl:
      "Cloud URL is not your Content Studio API. Deploy server/ to Render with a unique name, or use your own API key.",
    serverCloudFallback: "Cloud unavailable — using local server (localhost:8787).",
    aiTimeout: "AI took too long. Try again or switch model in Settings.",
    aiBusyUseOwnKey:
      "Shared cloud is busy. Settings → My own API key — pick a provider and paste your key for faster replies.",
    aiFallbackOwnKey: "Cloud busy — using your Gemini key…",
    draftUpdated: "Copied to your post",
    pasteTitle: "Paste text",
    pasteNamePlaceholder: "Title (optional)",
    pasteBodyPlaceholder: "Paste or type text…",
    cancel: "Cancel",
    add: "Add",
    pastedText: "Pasted text",
    processing: "Processing…",
    remove: "Remove",
    settingsSaved: "Settings saved",
    sourceAdded: "Source added: {name}",
    fileEmpty: "File is empty",
    unsupportedFiles: "Supported: video, audio, images, .txt, .md",
    analyzingPhoto: "Analyzing {name}…",
    visionWorking: "{provider} is analyzing the photo…",
    photoDone: "Photo analyzed: {name}",
    processingFile: "Processing {name}…",
    transcribing: "Transcribing (Whisper)…",
    transcribeFailed: "Could not transcribe — check audio",
    noSubstance:
      "The video is mostly intro/hook without useful facts for a post. Tap «What's in the video?» to see the summary, or add another source.",
    done: "Done: {name}",
    aiThinking: "Assistant is thinking…",
    cursorThinking: "Cursor is working… (30–120 s)",
    reloadAssistant: "Reload assistant (keeps chat history)",
    reloadAssistantShort: "Reload",
    stopAssistant: "Stop",
    chatStopped: "Stopped",
    aiSwitchedNotice: "Switched to {provider}. Chat history cleared.",
    aiSharedBusy: "Shared server is busy. Try again in a minute.",
    assistantReloaded: "Assistant reset. Chat history kept.",
    extractingSubstance: "Analyzing transcript…",
    ready: "Done",
    copied: "Copied!",
    copyFailed: "Could not copy to clipboard",
    noTextToCopy: "Nothing to copy — write a post or get a reply in chat",
    noTextToInsert: "Nothing to insert — write a post or get a reply in chat",
    insertingX: "Inserting on x.com…",
    cursorTimeout:
      "Cursor is too slow for chat (70+ s). Use Gemini (free) or OpenRouter in Settings → AI.",
    insertedX: "Inserted on x.com!",
    chipGenerate:
      "Generate a post based on the materials I provided, or based on my preferences",
    chipGenerateLabel: "Generate post",
    chipVideo:
      "Describe what was said in the video, what is the video's idea, and can we create an interesting post?",
    chipVideoLabel: "What's in the video?",
    imageDescPrefix: "[Image description]",
    imageManual: "[Image] {name} — turn assistant On to auto-describe",
    onboardingTitle: "Welcome to cheatXtwitter",
    onboardingBodyHosted: "Add sources, write posts, publish to X.",
    onboardingStart: "Get started",
    noApiKey: "Assistant is unavailable. Turn it on in Settings or write manually.",
    openSettings: "Open Settings",
    dockPanel: "Dock panel on the right (side-by-side)",
    openWindow: "Open in separate window",
    openFullscreen: "Open fullscreen in browser",
    openingWindow: "Opening window…",
    windowOpened: "Window opened",
    openingFullscreen: "Opening fullscreen tab…",
    fullscreenOpened: "Opened in new tab — fullscreen",
    docking: "Opening panel…",
    dockOpened: "Panel opened on the right",
    widthApplied: "Width updated",
    sideWidthSaved: "Width saved",
    sideWidthDrag: "Width updated",
    resizeCoach: "Width {pct}%",
    openPanelForWidth: "Open Panel first",
    openPanelNeedTab: "Open a normal site tab first (X, YouTube, etc.)",
    openPanelNoTab: "No site tab found. Open X, YouTube, or another website in a tab.",
    openPanelBlockedPage: "Side panel can't open on this page (chrome://, Extensions, Web Store). Switch to a regular site.",
    compactPanel: "Compact popup",
    compactPanelHint: "Click the extension icon for compact view",
    panelWidth: "Width",
    sideWidthHint: "Slider or drag panel edge — 25–75% of the page.",
    viewDockShort: "Side",
    viewWindowShort: "Win",
    viewFullscreenShort: "Full",
    openSideInBrowser: "Open side panel in browser",
    closeSurface: "Close",
    close: "Close",
    settingsMoreSoon: "More options will appear here later.",
  },
  uk: {
    brandTitle: "cheatXtwitter",
    brandSubtitle: "Розумні пости для X",
    sources: "Джерела",
    noSources: "Немає джерел. Додайте відео, аудіо, текст або фото.",
    videoAudio: "Відео / аудіо",
    photo: "Фото / зображення",
    textFile: "Текстовий файл",
    pasteText: "Вставити текст",
    settings: "Налаштування",
    uiLang: "Мова інтерфейсу",
    aiSettingsTitle: "ШІ",
    aiConnectionModeLabel: "Як підключити AI",
    aiConnectionShared: "Спільний AI асистент",
    aiConnectionOwn: "Мій власний API ключ",
    aiSharedHint: "Спільний сервер для всіх — можливі затримки та тимчасове перевантаження.",
    aiSharedUnavailable: "Спільний сервер тимчасово недоступний. Спробуйте пізніше.",
    chatHistoryTooLong: "Чат занадто довгий. Очистіть історію (іконка кошика) і спробуйте знову.",
    aiSharedFallbackOwnKey: "Спільний сервер зайнятий — використовую ваш збережений ключ Gemini…",
    serverWaking: "Прокидаємо спільний сервер… перший запит після паузи ~30–45 с",
    serverReady: "Сервер готовий — надсилаємо повідомлення…",
    aiOwnProviderLabel: "AI сервіс",
    ownApiKeyLabel: "API ключ",
    ownApiKeyPlaceholder: "Вставте ваш API ключ",
    ownModelLabel: "Модель",
    ownApiKeyRequired: "Додайте API ключ у Налаштуваннях",
    ownApiQuotaExceeded: "{provider}: квота API вичерпана. Перевірте баланс або оберіть інший сервіс.",
    ownApiKeyInvalid: "{provider}: невірний API ключ.",
    ownApiRateLimit: "{provider}: занадто багато запитів. Зачекайте хвилину.",
    ownApiKeyForProvider: "Вставте API ключ {provider} у Налаштуваннях нижче",
    aiKeyReady: "Ключ {provider} збережено — можна писати в чат",
    aiOwnFlowHint: "Оберіть AI сервіс → вставте API ключ → чат одразу працює.",
    testApi: "Перевірити API",
    testApiOk: "API працює: {reply}",
    testApiOwnOnly: "Увімкніть «Мій власний API ключ» для перевірки",
    aiOnHintOwnProvider: "Використовує ваш {provider} API ключ напряму з розширення.",
    cursorSlowHint:
      "Cursor Cloud Agent: чат працює, але відповідь 30–120 с. Статус показує прогрес.",
    aiOnHintHosted: "Спільний сервер — можливі затримки та тимчасове перевантаження.",
    aiCharacter: "Характер / тон",
    assistantLabel: "Асистент",
    stylePunchy: "Гострий / з хуком",
    styleCasual: "Розмовний",
    styleExpert: "Експертний",
    styleStory: "Історія / сцена",
    styleNews: "Новинний",
    styleMinimal: "Мінімалістичний",
    styleSarcastic: "Саркастичний / дотепний",
    styleMotivational: "Мотиваційний",
    styleProvocative: "Провокативний / сміливий",
    stylePoetic: "Поетичний / образний",
    styleTechnical: "Технічний / для білдерів",
    styleDegen: "Degen / crypto-native",
    styleWarm: "Теплий / емпатичний",
    styleContrarian: "Контраріанський",
    postLength: "Довжина поста",
    lengthAuto: "Авто",
    lengthMicro: "Мікро (<120 симв.)",
    lengthShort: "Один твіт",
    lengthMedium: "Середній",
    lengthLong: "Довгий",
    emojiMode: "Емодзі",
    emojiNone: "Без емодзі",
    emojiLight: "Мало (0–1)",
    emojiNormal: "Звично (1–3)",
    perspective: "Перспектива",
    perspectiveAuto: "Авто",
    perspectiveFirst: "Від першої особи (я)",
    perspectiveSecond: "Від другої особи (ти)",
    perspectiveThird: "Від третьої особи",
    temperature: "Креативність",
    tempLow: "Нижча — точніше",
    tempMid: "Середня",
    tempHigh: "Вища — живіше",
    tempMax: "Максимальна",
    postLang: "Мова відповідей",
    postLangAuto: "Авто (як джерела / запит)",
    postLangEn: "English",
    postLangUk: "Українська",
    whisperLang: "Мова транскрипції (відео/аудіо)",
    whisperAuto: "Авто",
    customRules: "Додаткові правила",
    customRulesPlaceholder:
      "Напр.: від першої особи, без емодзі, макс 200 символів, практичний тон…",
    saveSettings: "Зберегти",
    chat: "Чат",
    tabChat: "Чат",
    tabSources: "Джерела",
    tabSettings: "Налашт.",
    assistantName: "AI Асистент",
    postPreviewHandle: "@ваш_пост",
    postReady: "Чернетка",
    threadPart: "Частина {n}/{total}",
    copy: "Копіювати",
    insertX: "Вставити на X",
    draftLabel: "Ваш пост",
    draftPlaceholder: "Напишіть або вставте пост тут…",
    chars: "символів",
    chatPlaceholder: "Запитай ШІ або згенеруй пост…",
    send: "Надіслати",
    chatEmpty1: "Спілкуйся з ШІ тут — відео не обовʼязкове.",
    chatEmpty2: "Додай джерела зліва для постів з відео або просто напиши питання.",
    rateLimitWait: "Асистент думає…",
    serverOffline: "Хмара AI тимчасово недоступна. Спробуйте ще раз.",
    serverOutdated: "Потрібен redeploy хмарного сервера (папка server на Render).",
    serverWrongUrl:
      "Хмарний URL — не ваш Content Studio API. Задеплойте server/ на Render з унікальною назвою або вкажіть свій API ключ.",
    serverCloudFallback: "Хмара недоступна — використовується локальний сервер (localhost:8787).",
    aiTimeout: "AI занадто довго відповідає. Спробуйте ще раз або змініть модель.",
    aiBusyUseOwnKey:
      "Спільна хмара зайнята. Налаштування → Мій власний API ключ — оберіть сервіс і вставте ключ для швидших відповідей.",
    aiFallbackOwnKey: "Хмара зайнята — використовую ваш Gemini ключ…",
    draftUpdated: "Скопійовано в пост",
    pasteTitle: "Вставити текст",
    pasteNamePlaceholder: "Назва (необовʼязково)",
    pasteBodyPlaceholder: "Вставте або напишіть текст…",
    cancel: "Скасувати",
    add: "Додати",
    pastedText: "Вставлений текст",
    processing: "Обробка…",
    remove: "Видалити",
    settingsSaved: "Налаштування збережено",
    sourceAdded: "Джерело додано: {name}",
    fileEmpty: "Файл порожній",
    unsupportedFiles: "Підтримуються: відео, аудіо, фото, .txt, .md",
    analyzingPhoto: "Аналізую {name}…",
    visionWorking: "{provider} дивиться на фото…",
    photoDone: "Фото проаналізовано: {name}",
    processingFile: "Обробляю {name}…",
    transcribing: "Транскрибую (Whisper)…",
    transcribeFailed: "Не вдалось розпізнати мову — перевірте звук",
    noSubstance:
      "У відео лише вступ/хук без корисних фактів для поста. Натисни «Що в відео?» для розбору або додай інше джерело.",
    done: "Готово: {name}",
    aiThinking: "Асистент думає",
    cursorThinking: "Cursor працює… (30–120 с)",
    reloadAssistant: "Перезавантажити асистента (історія чату збережеться)",
    reloadAssistantShort: "Оновити",
    stopAssistant: "Стоп",
    chatStopped: "Зупинено",
    aiSwitchedNotice: "Перемкнено на {provider}. Історія чату очищена.",
    aiSharedBusy: "Спільний сервер зайнятий. Спробуйте за хвилину.",
    assistantReloaded: "Асистента перезавантажено. Історія чату збережена.",
    extractingSubstance: "Аналізую транскрипт…",
    ready: "Готово",
    copied: "Скопійовано!",
    copyFailed: "Не вдалося скопіювати",
    noTextToCopy: "Немає тексту — напишіть пост або отримайте відповідь у чаті",
    noTextToInsert: "Немає тексту — напишіть пост або отримайте відповідь у чаті",
    insertingX: "Вставляю на x.com…",
    cursorTimeout:
      "Cursor занадто повільний для чату (70+ с). Оберіть Gemini (безкоштовно) або OpenRouter у Налаштуваннях → ШІ.",
    insertedX: "Вставлено на x.com!",
    chipGenerate:
      "Згенеруй пост по матеріалах які я тобі надав, або по моїх побажаннях",
    chipGenerateLabel: "Згенеруй пост",
    chipVideo:
      "Опиши що розказували в відео, яка ідея відео, чи можемо ми створити цікавий пост?",
    chipVideoLabel: "Що в відео?",
    imageDescPrefix: "[Опис зображення]",
    imageManual: "[Фото] {name} — увімкніть асистента для авто-опису",
    onboardingTitle: "Ласкаво просимо в cheatXtwitter",
    onboardingBodyHosted: "Додайте джерела, пишіть пости, публікуйте на X.",
    onboardingStart: "Почати",
    noApiKey: "Асистент недоступний. Увімкніть у налаштуваннях або пишіть вручну.",
    openSettings: "Відкрити налаштування",
    dockPanel: "Панель збоку (поруч із сторінкою)",
    openWindow: "Окреме вікно",
    openFullscreen: "На весь екран у браузері",
    openingWindow: "Відкриваю вікно…",
    windowOpened: "Вікно відкрито",
    openingFullscreen: "Відкриваю вкладку на весь екран…",
    fullscreenOpened: "Відкрито у новій вкладці — на весь екран",
    docking: "Відкриваю панель…",
    dockOpened: "Панель відкрита справа",
    widthApplied: "Ширину оновлено",
    sideWidthSaved: "Ширину збережено",
    sideWidthDrag: "Ширину оновлено",
    resizeCoach: "Ширина {pct}%",
    openPanelForWidth: "Спочатку відкрийте Panel",
    openPanelNeedTab: "Спочатку відкрийте звичайну вкладку (X, YouTube тощо)",
    openPanelNoTab: "Немає вкладки з сайтом. Відкрийте X, YouTube або інший сайт.",
    openPanelBlockedPage: "Бік не працює на цій сторінці (chrome://, Extensions, Web Store). Перейдіть на звичайний сайт.",
    compactPanel: "Компактно",
    compactPanelHint: "Натисніть іконку розширення для компактного вигляду",
    panelWidth: "Ширина",
    sideWidthHint: "Повзунок або перетягни край панелі — 25–75% сторінки.",
    viewDockShort: "Бік",
    viewWindowShort: "Вікно",
    viewFullscreenShort: "Екран",
    openSideInBrowser: "Відкрити бік у браузері",
    closeSurface: "Закрити",
    close: "Закрити",
    settingsMoreSoon: "Інші опції з’являться тут пізніше.",
  },
};

const UI_LANG_OPTIONS = [
  { code: "uk", label: "Українська" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "tr", label: "Türkçe" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

const UI_LANG_CODES = UI_LANG_OPTIONS.map((o) => o.code);

LOCALES.ru = {
  ...LOCALES.en,
  brandSubtitle: "Умные посты для X",
  sources: "Источники",
  noSources: "Источников пока нет. Добавьте видео, аудио, текст или изображения.",
  videoAudio: "Видео / аудио",
  photo: "Фото / изображение",
  textFile: "Текстовый файл",
  pasteText: "Вставить текст",
  settings: "Настройки",
  uiLang: "Язык интерфейса",
  settingsMoreSoon: "Другие опции появятся здесь позже.",
  close: "Закрыть",
  chat: "Чат",
  send: "Отправить",
  copy: "Копировать",
  saveSettings: "Сохранить",
  chatPlaceholder: "Спросите AI или сгенерируйте пост…",
  chatEmpty1: "Чат с AI — видео не обязательно.",
  chatEmpty2: "Добавьте источники слева или просто задайте вопрос.",
  insertX: "Вставить в X",
  reloadAssistantShort: "Перезагрузить",
  viewDockShort: "Бок",
  viewWindowShort: "Окно",
  viewFullscreenShort: "Экран",
  dockPanel: "Боковая панель",
  openWindow: "Отдельное окно",
  openFullscreen: "На весь экран в браузере",
  panelWidth: "Ширина",
  chipGenerateLabel: "Сгенерировать пост",
  chipVideoLabel: "Что в видео?",
  pasteTitle: "Вставить текст",
  cancel: "Отмена",
  add: "Добавить",
  ready: "Готово",
  settingsSaved: "Сохранено",
};

let currentLocale = "en";

function normalizeUiLang(lang) {
  const code = String(lang || "en").toLowerCase();
  return UI_LANG_CODES.includes(code) ? code : "en";
}

function detectLocale() {
  const lang = (navigator.language || "en").toLowerCase();
  const prefixes = [
    ["uk", "uk"],
    ["ru", "ru"],
    ["de", "de"],
    ["es", "es"],
    ["fr", "fr"],
    ["pl", "pl"],
    ["pt", "pt"],
    ["it", "it"],
    ["tr", "tr"],
    ["zh", "zh"],
    ["ja", "ja"],
    ["ko", "ko"],
  ];
  for (const [prefix, code] of prefixes) {
    if (lang.startsWith(prefix)) return code;
  }
  return "en";
}

function setLocale(locale) {
  currentLocale = normalizeUiLang(locale);
  document.documentElement.lang = currentLocale;
}

function getLocale() {
  return currentLocale;
}

function t(key, vars = {}) {
  const str = LOCALES[currentLocale]?.[key] ?? LOCALES.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function applyPageI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.id === "aiModeHint" || el.id === "settingsVersion" || el.id === "windowVersion") return;

    const key = el.dataset.i18n;
    if (!key) return;

    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = t(key);
      return;
    }

    if (el.tagName === "OPTION") return;

    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll("option[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  document.querySelectorAll(".chip[data-i18n-chip]").forEach((chip) => {
    if (chip.dataset.i18nLabel) chip.textContent = t(chip.dataset.i18nLabel);
    chip.dataset.prompt = t(chip.dataset.i18nChip);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });

  const hint = document.getElementById("aiModeHint");
  if (hint && typeof globalThis.updateAiProviderUI === "function") {
    globalThis.populateOwnProviderSelect?.();
    globalThis.updateAiProviderUI();
  } else if (hint) {
    const mode = document.getElementById("aiConnectionMode")?.value || "shared";
    hint.textContent = t(mode === "shared" ? "aiOnHintHosted" : "aiOnHintOwnProvider").replace(
      "{provider}",
      ""
    );
  }
}

if (typeof window !== "undefined") {
  window.I18n = {
    setLocale,
    getLocale,
    t,
    applyPageI18n,
    detectLocale,
    normalizeUiLang,
    UI_LANG_OPTIONS,
    UI_LANG_CODES,
  };
}
