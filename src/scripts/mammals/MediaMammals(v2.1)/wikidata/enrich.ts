import { CONFIG, IUCN_MAP, MAMMAL_CLAIMS } from "../config/config.ts";
import { secureFetch } from "../network/fetcher.ts";
import { state } from "../state/state.ts";
import { extractClaims, parseClaim } from "./claims.ts";
import { normalizeClaim, normalizeGroup } from "./normalizer.ts";

export async function resolveStatusLabel(qid: string): Promise<string> {
  if (IUCN_MAP[qid]) return IUCN_MAP[qid];

  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json&origin=*`;
    const data = await secureFetch(url);
    const label = data.entities?.[qid]?.labels?.en?.value;
    return label ?? `Unknown (${qid})`;
  } catch {
    return `Unknown (${qid})`;
  }
}

export async function enrichBatch(
  mammals: any[],
): Promise<{ succeeded: any[]; failed: any[] }> {
  const valid = mammals.filter((m) => typeof m.qid === "string");
  const qids = valid.map((m) => m.qid);
  const failed: any[] = [];
  const succeeded: any[] = [];

  if (qids.length === 0) {
    return { succeeded, failed };
  }

  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join("|")}&props=claims&format=json&origin=*`;

    const data = await secureFetch(url);
    const entities = data.entities;
    let batchFailed = false;

    for (const mammal of valid) {
      const entry = entities[mammal.qid];
      if (!entry) {
        succeeded.push(mammal);
        continue;
      }

      if (entry && entry.claims) {
        const isSubspecies = mammal.rank === "SUBSPECIES";

        const rawTraits = {
          physical: extractClaims(entry.claims, MAMMAL_CLAIMS.physical) ?? {},
          reproduction: isSubspecies
            ? {}
            : extractClaims(entry.claims, MAMMAL_CLAIMS.reproduction) ?? {},
          ecology: isSubspecies
            ? {}
            : extractClaims(entry.claims, MAMMAL_CLAIMS.ecology) ?? {},
          conservation: isSubspecies
            ? {}
            : extractClaims(entry.claims, MAMMAL_CLAIMS.conservation) ?? {},
        };

        const traits = {
          physical: normalizeGroup(rawTraits.physical),
          reproduction: normalizeGroup(rawTraits.reproduction),
          ecology: normalizeGroup(rawTraits.ecology),
          conservation: normalizeGroup(rawTraits.conservation),
        };

        const status = traits.conservation?.P141;

        if (status?.qid) {
          traits.conservation.P141 = {
            qid: status.qid,
            status:
              IUCN_MAP[status.qid] ?? (await resolveStatusLabel(status.qid)),
          };
        }

        mammal.traits = traits;
        const rawImage = parseClaim(entry.claims, "P18");
        mammal.imageUrl = normalizeClaim(rawImage);
        state.stats.success++;
        succeeded.push(mammal);
      } else {
        failed.push(mammal);
        batchFailed = true;
      }
    }

    if (!batchFailed && state.currentBatchSize < CONFIG.NETWORK.BATCH_MAX) {
      state.currentBatchSize += 2;
    }

    return { succeeded, failed };
  } catch (e) {
    state.stats.errors += mammals.length;
    state.currentBatchSize = CONFIG.NETWORK.BATCH_MIN;
    console.error("Batch processing failed", e);
    throw e;
  }
}
