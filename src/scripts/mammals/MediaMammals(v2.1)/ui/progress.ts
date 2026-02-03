import readline from "readline";
import { state } from "../state/state.ts";

const UI_THROTTLE_MS = 200;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let startTime = Date.now();
let startProcessed = state.enrichedMap.size;
let lastRender = 0;
let uiLines = 0;
let spin = 0;

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function renderProgressBar(processed: number, total: number, width = 30) {
  const pct = processed / total;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"-".repeat(empty)}] ${(pct * 100).toFixed(2)}%`;
}

export function renderUI(processed: number, total: number) {
  const now = Date.now();
  if (now - lastRender < UI_THROTTLE_MS) return;
  lastRender = now;

  const elapsed = now - startTime;
  const effectiveProcessed = Math.max(1, processed - startProcessed);
  const MIN_ELAPSED_MS = 2000; // 2 sec warmup
  const safeElapsed = Math.max(elapsed, MIN_ELAPSED_MS);
  const rate = effectiveProcessed / (safeElapsed / 1000 || 1);
  // const remaining = (total - processed) / (rate || 1);
  const remaining = rate > 0.1 ? (total - processed) / rate : 0;

  const trend =
    state.stats.rateLimited > 0
      ? "\x1b[31m↓ RATE LIMITED\x1b[0m"
      : state.stats.errors > 0
        ? "\x1b[33m⚠ ADJUSTING\x1b[0m"
        : "\x1b[32m↑ STABLE\x1b[0m";

  const heartbeat = SPINNER[spin++ % SPINNER.length];

  const avgQID =
    state.timing.qidItems > 0
      ? `${(state.timing.qidMs / state.timing.qidItems).toFixed(1)} ms/item`
      : "warming up";

  const avgQIDBatch =
    state.timing.qidBatchItems > 0
      ? `${(state.timing.qidBatchMs / state.timing.qidBatchItems).toFixed(1)} ms/item`
      : "warming up";

  const avgEnrich =
    state.timing.enrichItems > 0
      ? `${(state.timing.enrichMs / state.timing.enrichItems).toFixed(1)} ms/item`
      : "warming up";

  const block = [
    `Speed        : ${rate.toFixed(2)} items/sec`,
    `Elapsed      : ${formatTime(elapsed)}`,
    `ETA          : ${formatTime(remaining * 1000)}`,
    `Progress     : ${processed}/${total} ${renderProgressBar(processed, total)}`,
    ``,
    `Batch Size   : ${state.currentBatchSize} ${trend}`,
    `Concurrency  : ${state.currentConcurrency}`,
    `Heartbeat    : ${heartbeat}`,
    ``,
    `--- Stats ---`,
    `Completed    : ${processed}`,
    `Resumed      : ${state.stats.resumed}`,
    `Attempted    : ${state.stats.attempted}`,
    `Success Enriched      : ${state.stats.success}`,
    `Skipped      : ${state.stats.skipped}`,
    `SkippedNoQID : ${state.stats.skippedNoQID}`,
    `Errors       : ${state.stats.errors}`,
    `Retries Q    : ${state.failedQueue.length}`,
    `429 Hits     : ${state.stats.rateLimited}`,
    ``,
    `--- Stage Timing ---`,
    `QID Resolve   : ${avgQID}`,
    `QID Throughput: ${avgQIDBatch}`,
    `Enrichment   : ${avgEnrich}`,
  ];

  if (uiLines > 0) {
    readline.moveCursor(process.stdout, 0, -uiLines);
  }

  block.forEach((line) => {
    readline.clearLine(process.stdout, 0);
    process.stdout.write(line + "\n");
  });

  uiLines = block.length;
}
