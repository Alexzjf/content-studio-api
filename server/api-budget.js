import { getPlanConfig } from "./plans.js";

export function getApiCostShare() {
  const raw = Number(process.env.PLAN_API_COST_SHARE ?? 0.55);
  if (!Number.isFinite(raw)) return 0.55;
  return Math.min(1, Math.max(0, raw));
}

export function getCostPerRequest() {
  const raw = Number(process.env.COST_PER_REQUEST_USD ?? 0.0015);
  return Number.isFinite(raw) && raw > 0 ? raw : 0.0015;
}

export function getCostPerVideo() {
  const raw = Number(process.env.COST_PER_VIDEO_USD ?? 0.008);
  return Number.isFinite(raw) && raw > 0 ? raw : 0.008;
}

export function estimateRequestCost(kind = "request") {
  return kind === "video" ? getCostPerVideo() : getCostPerRequest();
}

export function allocateApiBudgetFromPayment(amountUsd, planId) {
  const plan = getPlanConfig(planId);
  const share = getApiCostShare();
  const budgetUsd = Number(amountUsd || 0) * share;
  const costPerRequest = getCostPerRequest();
  const costPerVideo = getCostPerVideo();
  const monthlyRequests = plan.dailyRequests * 30;
  const monthlyVideos = plan.dailyVideos * 30;
  const estimatedMonthlyCost =
    monthlyRequests * costPerRequest + monthlyVideos * costPerVideo;

  return {
    budgetUsd,
    apiShare: share,
    costPerRequest,
    costPerVideo,
    monthlyRequests,
    monthlyVideos,
    estimatedMonthlyCost,
    coversPlan: budgetUsd >= estimatedMonthlyCost,
  };
}
