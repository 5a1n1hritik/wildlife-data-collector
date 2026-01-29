import { CONFIG } from "../config/config.ts";

export const state = {
  enrichedMap: new Map<string, any>(),
  failedQueue: [] as any[],
  stats: { success: 0, errors: 0, retries: 0 },
  currentBatchSize: CONFIG.NETWORK.INITIAL_BATCH_SIZE,
  lastSavedCount: 0,
};