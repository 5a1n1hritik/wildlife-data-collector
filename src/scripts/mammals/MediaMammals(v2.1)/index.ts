import pLimit from "p-limit";
import { state } from "./state/state.ts";
import { getQID } from "./wikidata/qidResolver.ts";
import { enrichBatch } from "./wikidata/enrich.ts";
import { saveData } from "./io/saver.ts";
import { renderUI } from "./ui/progress.ts";
import { CONFIG } from "./config/config.ts";
import { loadData } from "./io/loader.ts";
import { adaptSystem, getLimit } from "./network/limitController.ts";
import { writeErrorLog } from "./error/errorLogs.ts";

async function runRecovery(total: number) {
  if (state.failedQueue.length === 0) return;

  state.failedQueue = Array.from(
    new Map(state.failedQueue.map((m) => [m.key, m])).values(),
  );

  for (const m of state.failedQueue) {
    const limit = getLimit();

    await limit(async () => {
      m.qid = await getQID(m);
      if (!m.qid) {
        writeErrorLog({
          stage: "RECOVERY",
          canonicalName: m.canonicalName,
          message: "NO_QID_AFTER_RECOVERY",
        });

        state.stats.errors++;
        state.enrichedMap.set(m.key, {
          ...m,
          failed: true,
          reason: "NO_QID_AFTER_RETRY",
          lastSync: new Date().toISOString(),
        });
        return;
      }

      const { succeeded } = await enrichBatch([m]);

      if (succeeded.length === 1) {
        // state.stats.success++;
        state.enrichedMap.set(m.key, {
          ...m,
          lastSync: new Date().toISOString(),
        });
      } else {
        writeErrorLog({
          stage: "RECOVERY",
          canonicalName: m.canonicalName,
          qid: m.qid,
          message: "ENRICH_FAILED_AFTER_RECOVERY",
        });

        // state.stats.errors++;
        state.enrichedMap.set(m.key, {
          ...m,
          failed: true,
          reason: "ENRICH_FAILED",
          lastSync: new Date().toISOString(),
        });
      }
    });

    // const decided =
    // state.enrichedMap.size + state.stats.skippedNoQID + state.stats.errors;

    renderUI(state.enrichedMap.size, total);
  }
}

async function startEnrichment() {
  console.log(`\n\x1b[35m◈ Mammal Data Pipeline v3.0 (Senior Grade)\x1b[0m`);
  writeErrorLog({
    stage: "QID",
    canonicalName: "TEST_MAMMAL",
    message: "Testing if logger works",
  });
  const rawData = loadData();
  const total = rawData.length;
  state.total = rawData.length;
  let cursor = 0;
  const nameToKey = new Map<string, number>();
  rawData.forEach((m: any) => nameToKey.set(m.canonicalName, m.key));

  rawData.forEach((m: any) => {
    if (m.rank === "SUBSPECIES") {
      m.parentKey = nameToKey.get(m.parentSpecies);
    }
  });

  while (cursor < rawData.length) {
    const limit = getLimit();

    let batchRateLimited = false;
    state.flags.setBatchRateLimited = () => {
      batchRateLimited = true;
    };

    const chunk = rawData.slice(cursor, cursor + state.currentBatchSize);
    cursor += chunk.length;

    const resumed = chunk.filter((m: any) =>
      state.enrichedMap.has(m.key),
    ).length;
    state.stats.resumed += resumed;

    // Sirf wahi mammals lo jo abhi tak enriched nahi hain
    const pendingMammals = chunk.filter(
      (m: any) => !state.enrichedMap.has(m.key),
    );

    if (pendingMammals.length === 0) continue;

    try {
      // STEP A: Parallel mein QIDs nikalna
      const batchStart = Date.now();
      let batchQIDResolved = 0;

      await Promise.all(
        pendingMammals.map((mammal: any) =>
          limit(async () => {
            const t0 = Date.now();

            mammal.qid = await getQID(mammal);
            const t1 = Date.now();

            if (mammal.qid) {
              state.timing.qidMs += t1 - t0;
              state.timing.qidItems += 1;
              batchQIDResolved++;
            }
          }),
        ),
      );

      const batchEnd = Date.now();
      state.timing.qidBatchMs += batchEnd - batchStart;
      state.timing.qidBatchItems += batchQIDResolved;

      const validMammals = pendingMammals.filter((m: any) => m.qid);
      const skipped = pendingMammals.filter((m: any) => !m.qid);

      // FINALIZE NO-QID RECORDS (TERMINAL STATE)
      skipped.forEach((m: any) => {
        state.stats.skippedNoQID++;
        state.enrichedMap.set(m.key, {
          ...m,
          skipped: true,
          reason: "NO_QID",
          lastSync: new Date().toISOString(),
        });
      });

      if (validMammals.length === 0) {
        // const decided =
        //   state.enrichedMap.size +
        //   state.stats.skippedNoQID +
        //   state.stats.errors;
        // renderUI(decided, total);
        renderUI(state.enrichedMap.size, total);
        continue;
      }

      state.stats.attempted += validMammals.length;

      // STEP B: Enrichment Data (after every 50 QIDs)
      const enrichStart = Date.now();
      const { succeeded, failed } = await enrichBatch(validMammals);
      const enrichElapsed = Date.now() - enrichStart;

      state.timing.enrichMs += enrichElapsed;
      state.timing.enrichItems += succeeded.length + failed.length;

      if (validMammals.length > 0) {
        adaptSystem({
          success: succeeded.length,
          errors: failed.length,
          rateLimited: batchRateLimited,
        });
      }

      // STEP C — FINALIZE SUCCESS
      succeeded.forEach((m: any) => {
        state.stats.success++;
        state.enrichedMap.set(m.key, {
          ...m,
          lastSync: new Date().toISOString(),
        });
      });

      // STEP D — QUEUE FAILURES
      failed.forEach((m: any) => {
        m.retryCount = (m.retryCount ?? 0) + 1;
        state.failedQueue.push(m);
      });

      saveData();

      // const decided =
      //   state.enrichedMap.size + state.stats.skippedNoQID + state.stats.errors;

      renderUI(state.enrichedMap.size, total);

      await new Promise((r) =>
        setTimeout(r, CONFIG.NETWORK.WAIT_BETWEEN_BATCHES),
      );
    } catch (err) {
      state.currentBatchSize = CONFIG.NETWORK.BATCH_MIN;
      console.log(
        `\x1b[31m\n[!] Batch Error at index ${cursor}. Added to recovery queue.\x1b[0m`,
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // RECOVERY PHASE
  await runRecovery(total);

  saveData(true);
  console.log(`\n\n\x1b[32m✔ PIPELINE v2.1 FINISHED SUCCESSFULLY.\x1b[0m\n`);
}

startEnrichment().catch(console.error);
