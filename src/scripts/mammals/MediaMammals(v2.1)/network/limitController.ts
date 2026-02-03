import pLimit from "p-limit";
import { state } from "../state/state.ts";
import { CONFIG } from "../config/config.ts";

let limit = pLimit(state.currentConcurrency);

export function getLimit() {
  return limit;
}

export function adaptSystem(params: {
  success: number;
  errors: number;
  rateLimited: boolean;
}) {
  const { success, errors, rateLimited } = params;
  const errorRatio = errors / Math.max(1, success + errors);

  // 1️⃣ RATE LIMIT = emergency brake
  if (rateLimited) {
    state.currentBatchSize = Math.max(
      CONFIG.NETWORK.BATCH_MIN,
      Math.floor(state.currentBatchSize / 2),
    );

    if (state.currentConcurrency > CONFIG.NETWORK.CONCURRENCY_MIN) {
      state.currentConcurrency--;
      limit = pLimit(state.currentConcurrency);
    }

    state.stats.rateLimited = 0;
    return;
  }

  // 2️⃣ Error pressure
  if (errors > 0) {
    state.currentBatchSize = Math.max(
      CONFIG.NETWORK.BATCH_MIN,
      state.currentBatchSize - CONFIG.NETWORK.ADAPTIVE_STEP,
    );

    // if (
    //   errors > success &&
    //   state.currentConcurrency > CONFIG.NETWORK.CONCURRENCY_MIN
    // ) {
    //   state.currentConcurrency--;
    //   limit = pLimit(state.currentConcurrency);
    // }
    if (errorRatio > 0.3) {
      state.currentConcurrency--;
      limit = pLimit(state.currentConcurrency);
    }

    return;
  }

  // 3️⃣ Stable system = scale up slowly
  state.currentBatchSize = Math.min(
    CONFIG.NETWORK.BATCH_MAX,
    state.currentBatchSize + CONFIG.NETWORK.ADAPTIVE_STEP,
  );

  if (state.currentConcurrency < CONFIG.NETWORK.CONCURRENCY_MAX) {
    state.currentConcurrency++;
    limit = pLimit(state.currentConcurrency);
  }
}
