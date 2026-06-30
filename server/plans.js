import { findUserById, getDb } from "./db.js";
import { estimateUserRequestCost, computePlanApiEconomics } from "./api-budget.js";

// Ліміти розраховані під Gemini 2.5 Flash (важкий запит ~8k in + 800 out)
// при PLAN_API_COST_SHARE=0.5 — повне використання ≈ 50% ціни на API, 50% прибуток.
export const PLANS = {
  free: {
    id: "free",
    dailyRequests: 20,
    dailyVideos: 3,
    authorReplies: false,
    priceUsd: 0,
    priceUah: 0,
  },
  base: {
    id: "base",
    dailyRequests: 32,
    dailyVideos: 7,
    authorReplies: true,
    priceUsd: 12,
    priceUah: 499,
  },
  pro: {
    id: "pro",
    dailyRequests: 75,
    dailyVideos: 14,
    authorReplies: true,
    priceUsd: 26,
    priceUah: 1099,
  },
  pro_max: {
    id: "pro_max",
    dailyRequests: 130,
    dailyVideos: 23,
    authorReplies: true,
    priceUsd: 45,
    priceUah: 1899,
  },
};

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function nextResetIso() {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next.toISOString();
}

export function getPlanConfig(planId) {
  return PLANS[planId] || PLANS.free;
}

export function getUserPlanId(userId) {
  const user = findUserById(userId);
  const plan = String(user?.plan || "free").toLowerCase();
  if (user?.plan_expires_at) {
    const exp = Date.parse(user.plan_expires_at);
    if (exp && exp < Date.now()) return "free";
  }
  return PLANS[plan] ? plan : "free";
}

function getUsageRow(userId, day = todayUtc()) {
  return (
    getDb()
      .prepare("SELECT * FROM usage_daily WHERE user_id = ? AND day = ?")
      .get(userId, day) || { requests: 0, videos: 0 }
  );
}

export function getUserUsageStatus(userId) {
  const planId = getUserPlanId(userId);
  const plan = getPlanConfig(planId);
  const day = todayUtc();
  const row = getUsageRow(userId, day);
  const requests = row.requests || 0;
  const videos = row.videos || 0;
  const user = findUserById(userId);

  const apiBudgetUsd = Number(user?.api_budget_usd || 0);
  const apiBudgetSpent = Number(user?.api_budget_spent_usd || 0);

  return {
    plan: planId,
    day,
    requests: {
      used: requests,
      limit: plan.dailyRequests,
      remaining: Math.max(0, plan.dailyRequests - requests),
    },
    videos: {
      used: videos,
      limit: plan.dailyVideos,
      remaining: Math.max(0, plan.dailyVideos - videos),
    },
    authorReplies: plan.authorReplies,
    resetsAt: nextResetIso(),
    planExpiresAt: user?.plan_expires_at || null,
    priceUsd: plan.priceUsd,
    priceUah: plan.priceUah,
    apiBudget:
      apiBudgetUsd > 0
        ? {
            totalUsd: apiBudgetUsd,
            spentUsd: apiBudgetSpent,
            remainingUsd: Math.max(0, apiBudgetUsd - apiBudgetSpent),
          }
        : null,
  };
}

export function listPlansForApi() {
  return Object.values(PLANS).map((p) => {
    const econ = p.priceUsd > 0 ? computePlanApiEconomics(p.priceUsd, p.id) : null;
    return {
      id: p.id,
      dailyRequests: p.dailyRequests,
      dailyVideos: p.dailyVideos,
      authorReplies: p.authorReplies,
      priceUsd: p.priceUsd,
      priceUah: p.priceUah,
      profitUsd: econ?.profitUsd ?? 0,
      apiBudgetUsd: econ?.budgetUsd ?? 0,
    };
  });
}

export function checkAndConsumeQuota(userId, { kind = "request" } = {}) {
  const status = getUserUsageStatus(userId);
  const plan = getPlanConfig(status.plan);
  const day = status.day;
  const user = findUserById(userId);

  if (kind === "video" && status.videos.used >= plan.dailyVideos) {
    return {
      ok: false,
      code: "VIDEO_LIMIT_EXCEEDED",
      ...status,
      message: "Video daily limit reached",
    };
  }

  if (status.requests.used >= plan.dailyRequests) {
    return {
      ok: false,
      code: "LIMIT_EXCEEDED",
      ...status,
      message: "Daily request limit reached",
    };
  }

  const apiBudgetUsd = Number(user?.api_budget_usd || 0);
  if (status.plan !== "free" && apiBudgetUsd > 0) {
    const cost = estimateUserRequestCost(user, kind);
    const spent = Number(user?.api_budget_spent_usd || 0);
    if (spent + cost > apiBudgetUsd + 1e-9) {
      return {
        ok: false,
        code: "API_BUDGET_EXCEEDED",
        ...status,
        message: "Subscription API budget exhausted",
      };
    }
  }

  const videoInc = kind === "video" ? 1 : 0;
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO usage_daily (user_id, day, requests, videos, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET
         requests = requests + 1,
         videos = videos + ?,
         updated_at = excluded.updated_at`
    )
    .run(userId, day, videoInc, now, videoInc);

  if (status.plan !== "free" && apiBudgetUsd > 0) {
    const cost = estimateUserRequestCost(user, kind);
    database
      .prepare(
        "UPDATE users SET api_budget_spent_usd = api_budget_spent_usd + ?, updated_at = ? WHERE id = ?"
      )
      .run(cost, now, userId);
  }

  return { ok: true, ...getUserUsageStatus(userId) };
}
