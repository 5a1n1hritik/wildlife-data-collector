import { state } from "../state/state.ts";

export function renderUI(curr: number, total: number) {
  const progress = ((curr / total) * 100).toFixed(1);
  process.stdout.write(
    `\r\x1b[36m[${progress}%]\x1b[0m | ✅ ${state.stats.success} | ❌ ${state.stats.errors} | ⚡ Batch: ${state.currentBatchSize}  `,
  );
}