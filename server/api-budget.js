import { getPlanConfig } from "./plans.js";

const DAYS_PER_MONTH = 30;

export function getApiCostShare() {
  const raw = Number(process.env.PLAN_API_COST_SHARE ?? 0.5);
  if (!Number.isFinite(raw)) return 0.5;
  return Math.min(1, Math.max(0, raw));
}

/** Скільки «запитів» коштує одне відео в місячному бюджеті */
export function getVideoRequestRatio() {
  const raw = Number(process.env.VIDEO_REQUEST_RATIO ?? 5);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

export function computePlanApiEconomics(amountUsd, planId) {
  const plan = getPlanConfig(planId);
  const share = getApiCostShare();
  const priceUsd = Number(amountUsd || plan.priceUsd || 0);
  const budgetUsd = priceUsd * share;
  const profitUsd = priceUsd - budgetUsd;
  const monthlyRequests = plan.dailyRequests * DAYS_PER_MONTH;
  const monthlyVideos = plan.dailyVideos * DAYS_PER_MONTH;
  const videoRatio = getVideoRequestRatio();
  const monthlyUnits = monthlyRequests + monthlyVideos * videoRatio;

  let costPerRequest = 0;
  let costPerVideo = 0;
  if (budgetUsd > 0 && monthlyUnits > 0) {
    costPerRequest = budgetUsd / monthlyUnits;
    costPerVideo = costPerRequest * videoRatio;
  }

  return {
    budgetUsd,
    profitUsd,
    profitShare: 1 - share,
    apiShare: share,
    costPerRequest,
    costPerVideo,
    monthlyRequests,
    monthlyVideos,
    monthlyUnits,
    videoRequestRatio: videoRatio,
  };
}

export function allocateApiBudgetFromPayment(amountUsd, planId) {
  return computePlanApiEconomics(amountUsd, planId);
}

export function estimateUserRequestCost(user, kind = "request") {
  const costReq = Number(user?.api_cost_per_request || 0);
  const costVid = Number(user?.api_cost_per_video || 0);
  if (costReq > 0) {
    return kind === "video" ? (costVid > 0 ? costVid : costReq * getVideoRequestRatio()) : costReq;
  }
  return 0;
}
