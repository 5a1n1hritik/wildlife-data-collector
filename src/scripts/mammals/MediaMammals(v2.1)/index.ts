import pLimit from "p-limit";
import { state } from "./state/state.ts";
import { getQID } from "./wikidata/qidResolver.ts";
import { enrichBatch } from "./wikidata/enrich.ts";
import { saveData } from "./io/saver.ts";
import { renderUI } from "./ui/progress.ts";
import { CONFIG } from "./config/config.ts";
import { loadData } from "./io/loader.ts";


const limit = pLimit(CONFIG.NETWORK.INITIAL_CONCURRENCY);

async function startEnrichment() {
  console.log(`\n\x1b[35m◈ Mammal Data Pipeline v3.0 (Senior Grade)\x1b[0m`);
  const rawData = loadData();
  const total = rawData.length;
  let cursor = 0;
  const nameToKey = new Map<string, number>();
  rawData.forEach((m: any) => nameToKey.set(m.canonicalName, m.key));

  rawData.forEach((m: any) => {
    if (m.rank === "SUBSPECIES") {
      m.parentKey = nameToKey.get(m.parentSpecies);
    }
  });

  while (cursor < rawData.length) {
    const chunk = rawData.slice(cursor, cursor + state.currentBatchSize);
    cursor += chunk.length;

    // Sirf wahi mammals lo jo abhi tak enriched nahi hain
    const pendingMammals = chunk.filter(
      (m: any) => !state.enrichedMap.has(m.key),
    );
    if (pendingMammals.length === 0) continue;

    try {
      // STEP A: Parallel mein QIDs nikalna
      await Promise.all(
        pendingMammals.map((mammal: any) =>
          limit(async () => {
            mammal.qid = await getQID(mammal);
          }),
        ),
      );

      // Ye tab chalega jab upar ke 50 QIDs ka kaam khatam ho jayega
      // STEP B: Batch mein Data nikalna
      const { succeeded, failed } = await enrichBatch(pendingMammals);

      // STEP C: Map mein store karna aur Save karna
      succeeded.forEach((m: any) => {
        state.enrichedMap.set(m.key, {
          ...m,
          lastSync: new Date().toISOString(),
        });
      });

      failed.forEach((m: any) => {
        state.failedQueue.push(m);
      });

      saveData();

      await new Promise((r) =>
        setTimeout(r, CONFIG.NETWORK.WAIT_BETWEEN_BATCHES),
      );
    } catch (err) {
      state.failedQueue.push(...pendingMammals);
      state.currentBatchSize = CONFIG.NETWORK.BATCH_MIN;
      console.log(
        `\x1b[31m\n[!] Batch Error at index ${cursor}. Added to recovery queue.\x1b[0m`,
      );
      await new Promise((r) => setTimeout(r, 5000));
    }

    renderUI(state.enrichedMap.size, total);
  }

  // Final Step: Retry the Failed Queue once
  if (state.failedQueue.length > 0) {
    console.log(
      `\n\n\x1b[33m◈ Starting Recovery Phase for ${state.failedQueue.length} records...\x1b[0m`,
    );
    state.failedQueue = Array.from(
      new Map(state.failedQueue.map((m) => [m.key, m])).values(),
    );
    for (const m of state.failedQueue) {
      await limit(async () => {
        m.qid = await getQID(m);
        if (!m.qid) return;
        const savedBatchSize = state.currentBatchSize; // freeze
        const { succeeded } = await enrichBatch([m]);
        state.currentBatchSize = savedBatchSize; // restore
        if (succeeded.length === 1) {
          state.enrichedMap.set(m.key, {
            ...m,
            lastSync: new Date().toISOString(),
          });
        } else {
          m.retryCount = (m.retryCount ?? 0) + 1;
          if (m.retryCount < 3) {
            state.failedQueue.push(m);
          }
        }
      });
      renderUI(state.enrichedMap.size, total);
    }
  }

  saveData(true);
  console.log(`\n\n\x1b[32m✔ PIPELINE v2.1 FINISHED SUCCESSFULLY.\x1b[0m\n`);
}


startEnrichment().catch(console.error);