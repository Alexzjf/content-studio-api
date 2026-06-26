// ── Конфіг для розповсюдження розширення ─────────────────────────
//
// hostedApiUrl — URL вашого API (Koyeb, Render, Oracle тощо). Папка server/.
// Усі користувачі «Спільного AI» йдуть сюди. Ключ Gemini лише на сервері, не в розширенні.
//
// Оновити хмару після змін у server/:
//   chmod +x scripts/update-cloud-server.sh
//   ./scripts/update-cloud-server.sh
//
// localDevFallback: true — лише для розробки (пробує localhost:8787 якщо хмара зайнята)
//
// Локальні OAuth ключі — скопіюй auth-config.local.js.example → auth-config.local.js
// (підключається в app.html перед цим файлом)
var _authLocal = typeof AUTH_LOCAL !== "undefined" ? AUTH_LOCAL : {};

var EXTENSION_CONFIG = {
  hostedApiUrl: "https://content-studio-api-1.onrender.com",
  localDevFallback: false,
  panelWidthMin: 25,
  panelWidthMax: 75,
  panelWidthDefault: 25,
  standaloneWindowWidth: 1040,
  standaloneWindowHeight: 700,
  crmApiUrl: "",
  googleClientId:
    _authLocal.googleClientId ||
    "885065993868-0fpub31tvtk0d7q6s58559upkljun8e7.apps.googleusercontent.com",
  telegramBotUsername: _authLocal.telegramBotUsername || "",
  xClientId: _authLocal.xClientId || "",
};
