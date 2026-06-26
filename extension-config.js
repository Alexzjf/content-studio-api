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
var EXTENSION_CONFIG = {
  hostedApiUrl: "https://content-studio-api-1.onrender.com",
  localDevFallback: false,
  panelWidthMin: 25,
  panelWidthMax: 75,
  panelWidthDefault: 25,
  standaloneWindowWidth: 1040,
  standaloneWindowHeight: 700,
};
