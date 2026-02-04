import { CONFIG } from "../config/config.ts";

export const state = {
  total: 0,
  enrichedMap: new Map<string, any>(),
  failedQueue: [] as any[],
  stats: {
    success: 0,
    errors: 0,
    retries: 0,
    attempted: 0,
    skipped: 0,
    skippedNoQID: 0,
    skippedEnriched: 0,
    skippedDuplicate: 0,
    resumed: 0,
    rateLimited: 0,
  },
  currentBatchSize: CONFIG.NETWORK.INITIAL_BATCH_SIZE,
  currentConcurrency: CONFIG.NETWORK.INITIAL_CONCURRENCY,
  lastSavedCount: 0,
  timing: {
    qidMs: 0,
    qidItems: 0,
    enrichMs: 0,
    enrichItems: 0,
    qidBatchMs: 0,
    qidBatchItems: 0,
  },
  flags: {} as {
    // batchRateLimited: false,
    setBatchRateLimited?: () => void;
  },
  adaptive: {
    stableBatches: 0,
    lastScaleTs: 0,
  },
};
