import { verifyToken } from "./auth.js";
import { getUserUsageStatus, listPlansForApi } from "./plans.js";
import {
  createStripeCheckout,
  getPaymentStatusForUser,
  isStripeConfigured,
} from "./stripe-billing.js";

function readBearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireUser(req, res, next) {
  const payload = verifyToken(readBearer(req));
  if (!payload?.sub) {
    return res.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED" });
  }
  req.authUserId = payload.sub;
  next();
}

function successPageHtml() {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>cheatXtwitter — оплата</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family:system-ui,sans-serif; background:#0c0c0e; color:#e8e8ec; padding:24px; }
  .card { max-width:420px; text-align:center; background:#151518; border:1px solid #2a2a30;
    border-radius:12px; padding:28px 24px; }
  h1 { font-size:1.25rem; margin:0 0 12px; }
  p { color:#9a9aa8; line-height:1.5; margin:0 0 16px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Дякуємо за оплату!</h1>
    <p>Тариф активується автоматично протягом кількох секунд.</p>
    <p>Поверніться в розширення cheatXtwitter → <strong>Налаштування → Тарифи</strong> і перевірте план.</p>
  </div>
</body>
</html>`;
}

export function mountBillingRoutes(app) {
  app.get("/billing/plans", (_req, res) => {
    res.json({
      plans: listPlansForApi(),
      checkoutEnabled: isStripeConfigured(),
      cryptoEnabled: false,
    });
  });

  app.get("/billing/config", (_req, res) => {
    res.json({
      checkoutEnabled: isStripeConfigured(),
      provider: "stripe",
      methods: ["card", "apple_pay", "google_pay"],
    });
  });

  app.get("/billing/usage", requireUser, (req, res) => {
    res.json(getUserUsageStatus(req.authUserId));
  });

  app.post("/billing/checkout", requireUser, async (req, res) => {
    try {
      const planId = String(req.body?.plan || "").toLowerCase();
      const checkout = await createStripeCheckout(req.authUserId, planId);
      res.json(checkout);
    } catch (err) {
      res.status(400).json({ error: err.message || "Checkout failed" });
    }
  });

  app.get("/billing/payment/:id", requireUser, (req, res) => {
    const status = getPaymentStatusForUser(req.params.id, req.authUserId);
    if (!status) return res.status(404).json({ error: "Payment not found" });
    res.json(status);
  });

  app.get("/billing/success", (_req, res) => {
    res.type("html").send(successPageHtml());
  });

  app.get("/billing/cancel", (_req, res) => {
    res.type("html").send(
      successPageHtml()
        .replace("Дякуємо за оплату!", "Оплату скасовано")
        .replace("Тариф активується автоматично протягом кількох секунд.", "Ви можете спробувати знову в")
    );
  });
}
