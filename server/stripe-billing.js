import { randomUUID } from "crypto";
import Stripe from "stripe";
import {
  activateUserPlan,
  createPayment,
  findPaymentById,
  findPaymentByProviderId,
  findUserById,
  isPlaceholderEmail,
  setPaymentApiBudget,
  updatePaymentStatus,
} from "./db.js";
import { allocateApiBudgetFromPayment } from "./api-budget.js";
import { getPlanConfig } from "./plans.js";
import { queueSheetsSync } from "./sheets-crm.js";

let stripeClient = null;

function stripe() {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export function isStripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function publicApiUrl() {
  return (
    process.env.PUBLIC_API_URL?.replace(/\/$/, "") ||
    "https://content-studio-api-1.onrender.com"
  );
}

function planLabel(planId) {
  const labels = { base: "Base", pro: "Pro", pro_max: "Pro Max" };
  return labels[planId] || planId;
}

export async function createStripeCheckout(userId, planId) {
  const client = stripe();
  if (!client || !isStripeConfigured()) {
    throw new Error("Card payments not configured");
  }

  const plan = getPlanConfig(planId);
  if (!plan.priceUsd) {
    throw new Error("Invalid plan");
  }

  const paymentId = randomUUID();
  const user = findUserById(userId);
  const email =
    user?.primary_email && !isPlaceholderEmail(user.primary_email) ? user.primary_email : undefined;

  const session = await client.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(plan.priceUsd * 100),
          product_data: {
            name: `cheatXtwitter ${planLabel(planId)}`,
            description: `${planLabel(planId)} plan — 30 days`,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: paymentId,
    metadata: {
      payment_id: paymentId,
      user_id: userId,
      plan_id: planId,
    },
    success_url: `${publicApiUrl()}/billing/success?payment=${paymentId}`,
    cancel_url: `${publicApiUrl()}/billing/cancel`,
  });

  createPayment({
    id: paymentId,
    userId,
    planId,
    amountUsd: plan.priceUsd,
    provider: "stripe",
    providerPaymentId: session.id,
    invoiceUrl: session.url,
  });

  return {
    paymentId,
    planId,
    amountUsd: plan.priceUsd,
    checkoutUrl: session.url,
    invoiceUrl: session.url,
    provider: "stripe",
  };
}

function markPaymentPaid(payment, meta = {}) {
  if (payment.status === "paid") {
    return { ok: true, already: true, paymentId: payment.id };
  }
  updatePaymentStatus(payment.id, "paid", { metaJson: meta });
  const allocation = allocateApiBudgetFromPayment(payment.amount_usd, payment.plan_id);
  activateUserPlan(payment.user_id, payment.plan_id, 30, { amountUsd: payment.amount_usd });
  setPaymentApiBudget(payment.id, allocation.budgetUsd);
  queueSheetsSync(payment.user_id);
  return {
    ok: true,
    paid: true,
    paymentId: payment.id,
    userId: payment.user_id,
    planId: payment.plan_id,
    apiBudgetUsd: allocation.budgetUsd,
    apiShare: allocation.apiShare,
    estimatedMonthlyCost: allocation.estimatedMonthlyCost,
  };
}

export function fulfillStripeCheckoutSession(session) {
  const paymentId = session?.metadata?.payment_id || session?.client_reference_id;
  let payment = paymentId ? findPaymentById(paymentId) : null;
  if (!payment && session?.id) payment = findPaymentByProviderId(session.id);
  if (!payment) return { ok: false, reason: "payment_not_found" };

  if (session.payment_status !== "paid") {
    updatePaymentStatus(payment.id, session.payment_status || "pending", { metaJson: session });
    return { ok: true, pending: true, paymentId: payment.id };
  }

  return markPaymentPaid(payment, session);
}

export function handleStripeWebhookRaw(req, res) {
  const sig = req.headers["stripe-signature"];
  const client = stripe();
  if (!client || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  let event;
  try {
    event = client.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const result = fulfillStripeCheckoutSession(event.data.object);
      return res.json(result);
    }
    res.json({ ok: true, ignored: event.type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export function getPaymentStatusForUser(paymentId, userId) {
  const payment = findPaymentById(paymentId);
  if (!payment || payment.user_id !== userId) return null;
  return {
    paymentId: payment.id,
    planId: payment.plan_id,
    status: payment.status,
    amountUsd: payment.amount_usd,
    checkoutUrl: payment.invoice_url,
    invoiceUrl: payment.invoice_url,
    paidAt: payment.paid_at,
  };
}
