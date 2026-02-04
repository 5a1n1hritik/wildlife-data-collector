import pLimit from "p-limit";
import { state } from "../state/state.ts";
import { CONFIG } from "../config/config.ts";
import { logToUI } from "../ui/progress.ts";
import { writeErrorLog } from "../error/errorLogs.ts";

let limit = pLimit(state.currentConcurrency);
const STABLE_BATCH_THRESHOLD = 4; // need 4 calm batches
const SCALE_COOLDOWN_MS = 30_000; // 30s between scale-ups
const MAX_ERROR_RATIO = 0.15; // above this, no scaling

export function getLimit() {
  return limit;
}

export function adaptSystem(params: {
  success: number;
  errors: number;
  rateLimited: boolean;
}) {
  const { success, errors, rateLimited } = params;

  if (success === 0 && errors === 0) return;

  const total = success + errors;

  state.stats.errors += errors;

  const errorRatio = errors / Math.max(1, total);
  const now = Date.now();
  // const MAX_ERROR_RATIO = 0.1;

  /* ---------------- EMERGENCY BRAKE ---------------- */
  if (rateLimited) {
    state.adaptive.stableBatches = 0;

    state.currentBatchSize = Math.max(
      CONFIG.NETWORK.BATCH_MIN,
      Math.floor(state.currentBatchSize / 2),
    );

    if (state.currentConcurrency > CONFIG.NETWORK.CONCURRENCY_MIN) {
      state.currentConcurrency--;
      limit = pLimit(state.currentConcurrency);
    }

    writeErrorLog({
      stage: "ENRICH",
      canonicalName: "SYSTEM",
      message: "RATE_LIMIT_HIT_SCALING_DOWN",
      extra: {
        batchSize: state.currentBatchSize,
        concurrency: state.currentConcurrency,
      },
    });

    state.adaptive.lastScaleTs = now;
    return;
  }

  /* ---------------- ERROR PRESSURE ---------------- */
  if (errors > 0) {
    state.adaptive.stableBatches = 0;

    state.currentBatchSize = Math.max(
      CONFIG.NETWORK.BATCH_MIN,
      state.currentBatchSize - CONFIG.NETWORK.ADAPTIVE_STEP,
    );

    if (
      errors >= 3 &&
      errorRatio > MAX_ERROR_RATIO &&
      state.currentConcurrency > CONFIG.NETWORK.CONCURRENCY_MIN
    ) {
      state.currentConcurrency--;
      limit = pLimit(state.currentConcurrency);

      const msg = `⚠️ High Error Ratio (${(errorRatio * 100).toFixed(1)}%). Concurrency: ${state.currentConcurrency}`;
      logToUI(msg);

      writeErrorLog({
        stage: "ENRICH",
        canonicalName: "ADAPTIVE_SYSTEM",
        message: msg,
        extra: { success, errors, ratio: errorRatio },
      });
    }

    return;
  }

  /* ---------------- STABLE BATCH ---------------- */
  state.adaptive.stableBatches++;

  // Not stable long enough → do nothing
  if (state.adaptive.stableBatches < STABLE_BATCH_THRESHOLD) {
    return;
  }

  // Cooldown not expired → do nothing
  if (now - state.adaptive.lastScaleTs < SCALE_COOLDOWN_MS) {
    return;
  }

  /* ---------------- SLOW SCALE UP ---------------- */
  state.currentBatchSize = Math.min(
    CONFIG.NETWORK.BATCH_MAX,
    state.currentBatchSize + CONFIG.NETWORK.ADAPTIVE_STEP,
  );

  if (state.currentConcurrency < CONFIG.NETWORK.CONCURRENCY_MAX) {
    state.currentConcurrency++;
    limit = pLimit(state.currentConcurrency);
  }

  state.adaptive.lastScaleTs = now;
  state.adaptive.stableBatches = 0;
}
