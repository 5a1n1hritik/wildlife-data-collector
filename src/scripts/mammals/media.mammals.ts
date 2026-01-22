import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import fetch from "node-fetch";

// --- Configuration ---
const CONFIG = {
  FILES: {
    IN: "src/data/discovery/mammals/mammals.raw.json",
    OUT: "src/data/discovery/mammals/mammals.enriched.json",
    TEMP: "src/data/discovery/mammals/mammals.enriched.json.tmp",
  },
  NETWORK: {
    INITIAL_CONCURRENCY: 3,
    BATCH_MIN: 10,
    BATCH_MAX: 60,
    INITIAL_BATCH_SIZE: 50,
    TIMEOUT_MS: 20000,
    WAIT_BETWEEN_BATCHES: 1200,
  },
};

// --- 2. STATE TRACKER (Point 2: State management) ---
let state = {
  enrichedMap: new Map<string, any>(),
  failedQueue: [] as any[],
  stats: { success: 0, errors: 0, retries: 0 },
  currentBatchSize: CONFIG.NETWORK.INITIAL_BATCH_SIZE,
  lastSavedCount: 0,
};

const limit = pLimit(CONFIG.NETWORK.INITIAL_CONCURRENCY);

// --- Wikidata Mapping (Kal wala logic) ---
const UNITS_MAP: Record<string, { label: string; factor: number }> = {
  Q11570: { label: "kg", factor: 1 }, // Kilogram
  Q41803: { label: "kg", factor: 0.001 }, // Gram -> KG
  Q11574: { label: "years", factor: 0.00273973 }, // Days -> Years
  Q174728: { label: "cm", factor: 1 }, // Centimetre
  Q11573: { label: "cm", factor: 100 }, // Metre -> CM
};

const IUCN_MAP: Record<string, string> = {
  Q237350: "Extinct (EX)",
  Q239509: "extinct in the wild (EW)",
  Q219127: "Critically Endangered (CR)",
  Q96377276: "Endangered (EN)",
  Q278113: "Vulnerable (VU)",
  Q719675: "Near Threatened (NT)",
  Q211005: "Least Concern (LC)",
  Q3245245: "Data Deficient (DD)",
};

const P_NUMBERS = [
  "P2067",
  "P2257",
  "P2048",
  "P2049",
  "P2574",
  "P141",
  "P18",
  "P2974",
  "P1034",
  "P3811",
];

// --- 3. UTILITIES (Point 3: Defensive Programming) ---

async function fetchWithTimeout(
  url: string,
  timeout = CONFIG.NETWORK.TIMEOUT_MS,
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WildlifeDataCollector/3.0",
      },
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function secureFetch(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.status === 429) {
        const wait = (i + 1) * 3000;
        state.stats.retries++;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Non-JSON response");
      }
      return await res.json();
    } catch (e) {
      if (i === retries - 1) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw new Error("secureFetch exhausted retries without response");
}

function pickBestClaim(claims: Record<string, any[]>, p: string) {
  const list = claims[p];
  if (!Array.isArray(list)) return null;

  return (
    list.find((c) => c.rank === "preferred") ??
    list.find((c) => c.rank === "normal") ??
    null
  );
}

function parseClaim(claims: any, p: string) {
  const claim = pickBestClaim(claims, p)?.mainsnak?.datavalue;
  if (!claim) return "Unknown";

  if (claim.type === "quantity") {
    const amount = parseFloat(claim.value.amount);
    const unitRaw = claim.value.unit;

    if (unitRaw === "1") {
      return amount.toString();
    }

    const unitQid = unitRaw.split("/").pop();
    const unit = unitQid ? UNITS_MAP[unitQid] : undefined;
    return unit
      ? `${(amount * unit.factor).toFixed(2)} ${unit.label}`
      : amount.toString();
  }

  if (claim.type === "wikibase-entityid") {
    return claim.value.id; // sirf QID
  }

  if (p === "P18" && typeof claim.value === "string")
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(claim.value)}?width=1000`;

  return "Unknown";
}

// --- 4. ENGINE FUNCTIONS (Point 1: Adaptive & Chunked) ---

function cleanScientificName(item: any): string {
  if (!item || !item.scientificName) return "";
  // 1. Pehle brackets aur extra metadata hatao
  let baseName = item.scientificName
    .replace(/\(.*\)/g, "") // Remove (Linnaeus, 1758)
    .replace(/[^a-zA-Z\s-]/g, "") // Remove numbers or symbols
    .trim();

  const words = baseName.split(/\s+/);

  // 2. Rank ke hisaab se words decide karo
  if (item.rank === "SUBSPECIES" && words.length >= 3) {
    return words.slice(0, 3).join(" "); // Trinomial: Moschus moschiferus arcticus
  }

  return words.slice(0, 2).join(" "); // Binomial: Moschus moschiferus
}

async function getQID(item: any) {
  const cleanName = cleanScientificName(item);
  if (!cleanName) return null;

  try {
    const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=en&format=json&origin=*`;

    const res = await secureFetch(wikidataUrl);
    if (res.search && res.search.length > 0) {
      return res.search[0].id;
    }

    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(cleanName)}&format=json&origin=*&redirects=1`;
    const wikiRes = await secureFetch(wikiUrl);

    const pages = wikiRes.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const qid = pages[pageId]?.pageprops?.wikibase_item;
      if (qid) return qid;
    }
  } catch (e) {
    state.stats.errors++;
    console.error(`Error finding QID for ${cleanName}:`, e);
  }
  return null;
}

async function resolveStatusLabel(qid: string): Promise<string> {
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

async function enrichBatch(
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
        failed.push(mammal);
        batchFailed = true;
        continue;
      }

      if (entry && entry.claims) {
        const rawStatusQid = parseClaim(entry.claims, "P141");
        let resolvedStatus = "Unknown";

        if (typeof rawStatusQid === "string" && rawStatusQid !== "Unknown") {
          resolvedStatus = await resolveStatusLabel(rawStatusQid);
        } else if (mammal.rank === "SUBSPECIES" && mammal.parentKey) {
          const parent = state.enrichedMap.get(mammal.parentKey);
          if (parent?.traits?.status) {
            resolvedStatus = parent.traits.status;
          }
        }

        mammal.traits = {
          weight: parseClaim(entry.claims, "P2067"),
          lifespan: parseClaim(entry.claims, "P2257"),
          height: parseClaim(entry.claims, "P2048"),
          status: resolvedStatus,
        };
        mammal.imageUrl = parseClaim(entry.claims, "P18");
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
      // STEP A: Parallel mein QIDs nikalna (Phase 1)
      await Promise.all(
        pendingMammals.map((mammal: any) =>
          limit(async () => {
            mammal.qid = await getQID(mammal);
          }),
        ),
      );

      // STEP B: Batch mein Data nikalna (Phase 2)
      // Ye tab chalega jab upar ke 50 QIDs ka kaam khatam ho jayega
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
  console.log(`\n\n\x1b[32m✔ PIPELINE FINISHED SUCCESSFULLY.\x1b[0m\n`);
}

function loadData() {
  const dir = path.dirname(CONFIG.FILES.OUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(CONFIG.FILES.TEMP)) {
    fs.unlinkSync(CONFIG.FILES.TEMP);
  }

  if (fs.existsSync(CONFIG.FILES.OUT)) {
    const existing = JSON.parse(fs.readFileSync(CONFIG.FILES.OUT, "utf-8"));
    existing.forEach((m: any) => state.enrichedMap.set(m.key, m));
    state.lastSavedCount = state.enrichedMap.size;
    console.log(
      `\x1b[90mResuming from: ${state.enrichedMap.size} records\x1b[0m\n`,
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG.FILES.IN, "utf-8"));
}

function saveData(force = false) {
  const data = Array.from(state.enrichedMap.values());
  const shouldCommit = force || data.length - state.lastSavedCount >= 50;

  if (!shouldCommit) return;

  fs.writeFileSync(CONFIG.FILES.TEMP, JSON.stringify(data, null, 2));
  fs.renameSync(CONFIG.FILES.TEMP, CONFIG.FILES.OUT);

  state.lastSavedCount = data.length;
}

function renderUI(curr: number, total: number) {
  const progress = ((curr / total) * 100).toFixed(1);
  process.stdout.write(
    `\r\x1b[36m[${progress}%]\x1b[0m | ✅ ${state.stats.success} | ❌ ${state.stats.errors} | ⚡ Batch: ${state.currentBatchSize}  `,
  );
}

startEnrichment().catch(console.error);
