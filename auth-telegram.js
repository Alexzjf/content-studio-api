(function () {
  const params = new URLSearchParams(location.search);
  const bot = params.get("bot");
  const status = document.getElementById("status");
  const widget = document.getElementById("widget");

  if (!bot) {
    status.textContent = "Telegram bot not configured.";
    return;
  }

  window.onTelegramAuth = function (user) {
    const redirect = chrome.identity.getRedirectURL("telegram");
    const url = new URL(redirect);
    url.searchParams.set("payload", encodeURIComponent(JSON.stringify(user)));
    location.href = url.toString();
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://telegram.org/js/telegram-widget.js?22";
  script.setAttribute("data-telegram-login", bot);
  script.setAttribute("data-size", "large");
  script.setAttribute("data-radius", "8");
  script.setAttribute("data-onauth", "onTelegramAuth(user)");
  script.setAttribute("data-request-access", "write");
  script.onload = () => {
    status.textContent = "Sign in with Telegram";
  };
  script.onerror = () => {
    status.textContent = "Could not load Telegram widget.";
  };
  widget.appendChild(script);
})();
