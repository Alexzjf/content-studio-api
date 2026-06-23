const LOCALES = {
  en: {
    brandTitle: "Content Studio",
    brandSubtitle: "Sources + posts for X",
    sources: "Sources",
    noSources: "No sources yet. Add video, audio, text or images.",
    videoAudio: "Video / audio",
    photo: "Photo / image",
    textFile: "Text file",
    pasteText: "Paste text",
    settings: "Settings",
    uiLang: "Interface language",
    aiSettingsTitle: "AI",
    aiOnHintHosted: "Shared cloud — may be slow when busy. Add your Gemini key below for instant replies.",
    aiOnHintOwnKey: "Uses your Gemini API key directly from the extension.",
    aiOnHintOpenRouter: "Any model via OpenRouter — Claude, GPT, Gemini, Llama…",
    aiProviderLabel: "AI connection",
    aiProviderHosted: "Content Studio cloud (shared)",
    aiProviderOpenRouter: "My OpenRouter key (any model)",
    aiProviderGemini: "My Gemini API key",
    aiProviderHostedHint: "Free cloud server — always on. No key needed.",
    openrouterApiKeyLabel: "OpenRouter API key",
    openrouterApiKeyPlaceholder: "sk-or-…",
    openrouterApiKeyHint: "openrouter.ai/keys — Claude, GPT, Gemini, Llama and more. Stored locally.",
    openrouterModelLabel: "Model ID",
    openrouterModelPlaceholder: "anthropic/claude-3.5-haiku",
    openrouterKeyRequired: "Add your OpenRouter API key in Settings",
    geminiApiKeyLabel: "Gemini API key",
    geminiApiKeyPlaceholder: "AIza…",
    geminiApiKeyHint: "Free at aistudio.google.com/apikey — stored locally in the extension.",
    geminiModelLabel: "Gemini model",
    geminiKeyRequired: "Add your Gemini API key in Settings",
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
    copy: "Copy",
    insertX: "Insert on X",
    draftLabel: "Your post",
    draftPlaceholder: "Write or paste your post here…",
    chars: "characters",
    chatPlaceholder: "Ask AI anything or generate a post…",
    send: "Send",
    chatEmpty1: "Chat with AI here — no video required.",
    chatEmpty2: "Add sources on the left for posts from video, or just type a question.",
    rateLimitWait: "Gemini limit — waiting {sec}s…",
    serverOffline: "Cloud AI server unavailable. Try again or use your own API key in Settings.",
    serverOutdated: "Cloud server needs redeploy (server folder on Render).",
    serverWrongUrl:
      "Cloud URL is not your Content Studio API. Deploy server/ to Render with a unique name, or use your own API key.",
    serverCloudFallback: "Cloud unavailable — using local server (localhost:8787).",
    aiTimeout: "AI took too long. Try again or switch model in Settings.",
    aiBusyUseOwnKey:
      "Shared cloud is busy. Settings → My Gemini API key — paste your key for faster replies.",
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
    extractingSubstance: "Analyzing transcript…",
    ready: "Done",
    copied: "Copied!",
    insertedX: "Inserted on x.com!",
    chipGenerate:
      "Write one ready-to-publish X post from the video/audio transcript in sources. Creator's voice (not the narrator). Strong hook + specific details from the content. Post text only.",
    chipGenerateLabel: "Generate post",
    chipVideo:
      "Read the SOURCES (especially video/audio transcripts) and explain in detail what was said: main topic, key points in order, facts, examples, and conclusion. Structured answer, not a Twitter post.",
    chipVideoLabel: "What's in the video?",
    chipPost: "Write an X post as the author (not the video narrator). Find the main idea/tactic in sources. Strong hook + specifics. Skip 'none of this is real' intros. Post text only.",
    chipPostLabel: "Post for X",
    chipThread:
      "Thread of 4 tweets. One idea per tweet, max 280 chars. Number 1/ 2/ 3/ 4/. Thread text only.",
    chipThreadLabel: "Thread",
    chipArticle:
      "Long X post: one main thesis, short paragraphs. No intro like 'in this video'. Text only.",
    chipArticleLabel: "Article",
    chipIdeas: "Suggest 3 different angles/hooks for a post from the sources — 1–2 sentences each.",
    chipIdeasLabel: "3 ideas",
    imageDescPrefix: "[Image description]",
    imageManual: "[Image] {name} — turn assistant On to auto-describe",
    onboardingTitle: "Welcome to Content Studio",
    onboardingBodyHosted: "Add sources, write posts, publish to X.",
    onboardingStart: "Get started",
    noApiKey: "Assistant is unavailable. Turn it on in Settings or write manually.",
    openSettings: "Open Settings",
    dockPanel: "Open panel on the right",
    docking: "Opening panel…",
    dockOpened: "Panel opened on the right",
    widthApplied: "Width updated",
    sideWidthSaved: "Width saved",
    sideWidthDrag: "Width updated",
    resizeCoach: "Width {pct}%",
    openPanelForWidth: "Open Panel first",
    compactPanel: "Compact popup",
    compactPanelHint: "Click the extension icon for compact view",
    panelWidth: "Width",
    sideWidthHint: "Slider changes panel width (15–50% of the page).",
  },
  uk: {
    brandTitle: "Content Studio",
    brandSubtitle: "Джерела + пости для X",
    sources: "Джерела",
    noSources: "Немає джерел. Додайте відео, аудіо, текст або фото.",
    videoAudio: "Відео / аудіо",
    photo: "Фото / зображення",
    textFile: "Текстовий файл",
    pasteText: "Вставити текст",
    settings: "Налаштування",
    uiLang: "Мова інтерфейсу",
    aiSettingsTitle: "ШІ",
    aiOnHintHosted: "Спільна хмара — інколи повільно. Додайте свій Gemini ключ нижче для швидких відповідей.",
    aiOnHintOwnKey: "Використовує ваш Gemini API ключ напряму з розширення.",
    aiOnHintOpenRouter: "Будь-яка модель через OpenRouter — Claude, GPT, Gemini, Llama…",
    aiProviderLabel: "Підключення AI",
    aiProviderHosted: "Хмара Content Studio (спільний)",
    aiProviderOpenRouter: "Мій OpenRouter ключ (будь-яка модель)",
    aiProviderGemini: "Мій Gemini API ключ",
    aiProviderHostedHint: "Безкоштовний хмарний сервер — працює постійно. Ключ не потрібен.",
    openrouterApiKeyLabel: "OpenRouter API ключ",
    openrouterApiKeyPlaceholder: "sk-or-…",
    openrouterApiKeyHint: "openrouter.ai/keys — Claude, GPT, Gemini, Llama та ін. Зберігається локально.",
    openrouterModelLabel: "ID моделі",
    openrouterModelPlaceholder: "anthropic/claude-3.5-haiku",
    openrouterKeyRequired: "Додайте OpenRouter API ключ у Налаштуваннях",
    geminiApiKeyLabel: "Gemini API ключ",
    geminiApiKeyPlaceholder: "AIza…",
    geminiApiKeyHint: "Безкоштовно на aistudio.google.com/apikey — зберігається локально в розширенні.",
    geminiModelLabel: "Модель Gemini",
    geminiKeyRequired: "Додайте Gemini API ключ у Налаштуваннях",
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
    copy: "Копіювати",
    insertX: "Вставити на X",
    draftLabel: "Ваш пост",
    draftPlaceholder: "Напишіть або вставте пост тут…",
    chars: "символів",
    chatPlaceholder: "Запитай ШІ або згенеруй пост…",
    send: "Надіслати",
    chatEmpty1: "Спілкуйся з ШІ тут — відео не обовʼязкове.",
    chatEmpty2: "Додай джерела зліва для постів з відео або просто напиши питання.",
    rateLimitWait: "Gemini зайнятий — чекаю {sec} сек…",
    serverOffline: "Хмарний сервер AI недоступний. Спробуйте пізніше або свій API ключ у Налаштуваннях.",
    serverOutdated: "Потрібен redeploy хмарного сервера (папка server на Render).",
    serverWrongUrl:
      "Хмарний URL — не ваш Content Studio API. Задеплойте server/ на Render з унікальною назвою або вкажіть свій API ключ.",
    serverCloudFallback: "Хмара недоступна — використовується локальний сервер (localhost:8787).",
    aiTimeout: "AI занадто довго відповідає. Спробуйте ще раз або змініть модель.",
    aiBusyUseOwnKey:
      "Спільна хмара зайнята. Налаштування → Мій Gemini API ключ — вставте ключ, буде швидше.",
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
    aiThinking: "Асистент думає…",
    extractingSubstance: "Аналізую транскрипт…",
    ready: "Готово",
    copied: "Скопійовано!",
    insertedX: "Вставлено на x.com!",
    chipGenerate:
      "Згенеруй готовий пост для X з транскрипту відео/аудіо в джерелах. Голос автора (не диктора). Сильний хук + конкретика з ролика. Тільки текст поста.",
    chipGenerateLabel: "Згенеруй пост",
    chipVideo:
      "Прочитай джерела (особливо транскрипт відео/аудіо) і детально розкажи що там говорили: головна тема, ключові думки по порядку, факти, приклади, висновок. Структурована відповідь, не пост для X.",
    chipVideoLabel: "Що в відео?",
    chipPost:
      "Напиши пост для X від імені автора (не диктора з відео). Знайди головну ідею/тактику в джерелах. Сильний хук + конкретика. Без вступу «це не справжнє», без переказу транскрипту. Тільки текст поста.",
    chipPostLabel: "Пост для X",
    chipThread:
      "Тред з 4 твітів. Кожен твіт — одна думка, до 280 символів. Нумеруй 1/ 2/ 3/ 4/. Тільки текст треду.",
    chipThreadLabel: "Тред",
    chipArticle:
      "Довгий пост для X: один головний тезис, короткі абзаци. Без вступу «у цьому відео». Тільки текст.",
    chipArticleLabel: "Стаття",
    chipIdeas:
      "Запропонуй 3 різні кути/хуки для поста на основі джерел — коротко, по 1–2 речення кожен.",
    chipIdeasLabel: "3 ідеї",
    imageDescPrefix: "[Опис зображення]",
    imageManual: "[Фото] {name} — увімкніть асистента для авто-опису",
    onboardingTitle: "Ласкаво просимо в Content Studio",
    onboardingBodyHosted: "Додайте джерела, пишіть пости, публікуйте на X.",
    onboardingStart: "Почати",
    noApiKey: "Асистент недоступний. Увімкніть у налаштуваннях або пишіть вручну.",
    openSettings: "Відкрити налаштування",
    dockPanel: "Відкрити панель справа",
    docking: "Відкриваю панель…",
    dockOpened: "Панель відкрита справа",
    widthApplied: "Ширину оновлено",
    sideWidthSaved: "Ширину збережено",
    sideWidthDrag: "Ширину оновлено",
    resizeCoach: "Ширина {pct}%",
    openPanelForWidth: "Спочатку відкрийте Panel",
    compactPanel: "Компактно",
    compactPanelHint: "Натисніть іконку розширення для компактного вигляду",
    panelWidth: "Ширина",
    sideWidthHint: "Повзунок змінює ширину панелі (15–50% сторінки).",
  },
};

let currentLocale = "en";

function detectLocale() {
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("uk")) return "uk";
  return "en";
}

function setLocale(locale) {
  currentLocale = LOCALES[locale] ? locale : "en";
  document.documentElement.lang = currentLocale === "uk" ? "uk" : "en";
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
  if (hint) {
    const provider = document.getElementById("aiProvider")?.value || "hosted";
    const hintKey =
      provider === "gemini"
        ? "aiOnHintOwnKey"
        : provider === "openrouter"
          ? "aiOnHintOpenRouter"
          : "aiOnHintHosted";
    hint.textContent = t(hintKey);
  }
}

if (typeof window !== "undefined") {
  window.I18n = { setLocale, getLocale, t, applyPageI18n, detectLocale };
}
