import fs from "fs";
import path from "path";
import pLimit from "p-limit";

const OUT_FILE = "src/data/discovery/birds.raw.json";
const BASE_URL = "https://api.gbif.org/v1/species/search";
const LIMIT = 100;
const CONCURRENCY = 3; // Ek sath 3 parallel requests jayengi
const SLEEP = 150;     // Thoda kam delay kyunki parallel handle ho raha hai

const limit = pLimit(CONCURRENCY);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Results global rakhein taaki checkpoint kaam kare
let resultsMap = new Map();

async function safeFetch(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 429) {
            console.log(" Rate limit! Sleeping for 20s...");
            await sleep(20000);
        }
        return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function getAvesKey(): Promise<number> {
  const data = await safeFetch("https://api.gbif.org/v1/species/match?name=Aves&rank=CLASS");
  if (!data?.usageKey) throw new Error("Aves taxonKey not found");
  return data.usageKey;
}

async function getBirdOrders(avesKey: number) {
  const url = `${BASE_URL}?` + new URLSearchParams({
    rank: "ORDER", status: "ACCEPTED", higherTaxonKey: String(avesKey), limit: "100", 
  });
  const data = await safeFetch(url);
  return data?.results
    .filter((o: any) => o.classKey === avesKey && o.canonicalName) 
    .map((o: any) => ({ key: o.key, name: o.canonicalName })) || [];
}

async function run() {
  console.log("Starting FAST & SECURE GBIF bird discovery...");
  
  const avesKey = await getAvesKey(); 
  const orders = await getBirdOrders(avesKey);
  
  // Checkpoint: Load existing data
  if (fs.existsSync(OUT_FILE)) {
    const content = fs.readFileSync(OUT_FILE, "utf-8").trim();
    if (content) {
        const existingData = JSON.parse(content);
        existingData.forEach((b: any) => resultsMap.set(b.key, b));
        console.log(`Checkpoint found: ${resultsMap.size} birds already collected.`);
    }
  }

  for (const order of orders) {
    console.log(`\n Fetching Order: ${order.name}`);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      if (offset >= 10000) break; // GBIF limit safety

      // Optimized: Batch requests using pLimit
      const tasks = [];
      for (let i = 0; i < CONCURRENCY && hasMore; i++) {
        const currentOffset = offset;
        tasks.push(limit(async () => {
            const url = `${BASE_URL}?` + new URLSearchParams({
              rank: "SPECIES", status: "ACCEPTED",
              higherTaxonKey: String(order.key),
              limit: String(LIMIT), offset: String(currentOffset),
              datasetKey: "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c" 
            });

            const data = await safeFetch(url);
            if (!data || !data.results) return false;

            data.results.forEach((item: any) => {
                if (item.canonicalName && item.classKey === avesKey) {
                    resultsMap.set(item.key, {
                        key: item.key,
                        scientificName: item.scientificName,
                        canonicalName: item.canonicalName,
                        vernacularName: item.vernacularName || "", 
                        order: order.name,
                        family: item.family || "Unknown",
                        genus: item.genus || "Unknown",
                        conservationStatus: item.threatStatus || "NE",
                    });
                }
            });
            return !data.endOfRecords;
        }));
        offset += LIMIT;
      }

      const results = await Promise.all(tasks);
      hasMore = results.every(res => res === true) && results.length > 0;

      // Real-time Save: Har batch ke baad disk par likhein
      const dir = path.dirname(OUT_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(resultsMap.values()), null, 2));

      process.stdout.write(`\r  Total unique birds saved: ${resultsMap.size} | Offset: ${offset}`);
      await sleep(SLEEP);
    }
  }

  console.log(`\n\n Done! Total Unique Birds Collected: ${resultsMap.size}`);
}

run().catch(console.error);