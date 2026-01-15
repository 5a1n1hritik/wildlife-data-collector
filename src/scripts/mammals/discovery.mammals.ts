import fs from "fs";
import path from "path";
import pLimit from "p-limit";

const OUT_FILE = "src/data/discovery/mammals/mammals.raw.json";
const BASE_URL = "https://api.gbif.org/v1/species/search";
const CLASS_KEY = 359; // Mammalia TaxonKey
const LIMIT = 100;
const CONCURRENCY = 3;

const limit = pLimit(CONCURRENCY);
// Key-based results map
let resultsMap = new Map<number, any>();

let discoverData: any[] = [];
let isShuttingDown = false; // Flag for graceful shutdown
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// File Load logic with JSON validation
if (fs.existsSync(OUT_FILE)) {
  try {
    const content = fs.readFileSync(OUT_FILE, "utf-8").trim();
    const discoverData = content ? JSON.parse(content) : [];
    discoverData.forEach((m: any) => resultsMap.set(m.key, m));
    console.log(`  Resume from: ${discoverData.size} mammals loaded.`);
  } catch (e) {
    console.error(" Output file corrupt. Making backup and Resetting to [].");
    discoverData = [];
  }
}

// Helper: Save function
const saveData = () => {
  const dataArray = Array.from(resultsMap.values());
  const tempFile = `${OUT_FILE}.tmp`;
  console.log(`\n Saving ${discoverData.length} records to file...`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(discoverData, null, 2));
};

// Signal Listeners: Ctrl+C handle karne ke liye
process.on("SIGINT", () => {
  console.log("\n Stopping... signal received (Ctrl+C). Saving progress...");
  isShuttingDown = true;
  saveData();
  process.exit();
});

// --- 2. Smart Retry Fetch (Internet Loss Protection) ---
async function fetchWithRetry(
  url: string,
  retries = 5,
  backoff = 5000
): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      console.log(
        `\n📶 Internet issue? Retrying in ${
          backoff / 1000
        }s... (${retries} left)`
      );
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2); // Exponential backoff
    }
    throw err;
  }
}

async function run() {
  console.log("Starting IMMORTAL Mammal Discovery (with File-based Backup)...");

  // // --- STEP 1: Existing Data Load (Persistence) ---
  // if (fs.existsSync(OUT_FILE)) {
  //   try {
  //     const existingData = JSON.parse(fs.readFileSync(OUT_FILE, "utf-8"));
  //     existingData.forEach((m: any) => resultsMap.set(m.key, m));
  //     console.log(`📦 Loaded ${resultsMap.size} mammals from disk.`);
  //   } catch (e) {
  //     console.log("⚠️ Disk file issues, starting fresh.");
  //   }
  // }

  const orderUrl = `${BASE_URL}?rank=ORDER&status=ACCEPTED&higherTaxonKey=${CLASS_KEY}&limit=100`;
  const orderRes = await fetch(orderUrl);
  const orderData = await orderRes.json();
  const orders = orderData.results.filter((o: any) => o.classKey === CLASS_KEY);

  for (const order of orders) {
    console.log(`\n🐾 Order: ${order.canonicalName}`);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      if (offset >= 10000) break;

      const url =
        `${BASE_URL}?` +
        new URLSearchParams({
          status: "ACCEPTED",
          higherTaxonKey: String(order.key),
          limit: String(LIMIT),
          offset: String(offset),
          datasetKey: "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c",
        });

      const res = await fetch(url);
      const data = await res.json();
      if (!data || !data.results) break;

      data.results.forEach((item: any) => {
        const validRanks = ["SPECIES", "SUBSPECIES", "VARIETY"];
        if (
          item.canonicalName &&
          item.classKey === CLASS_KEY &&
          validRanks.includes(item.rank)
        ) {
          const existingItem = resultsMap.get(item.key);

          const freshData = {
            key: item.key,
            scientificName: item.scientificName,
            canonicalName: item.canonicalName,
            rank: item.rank,
            parentSpecies: item.species || item.canonicalName,
            order: order.canonicalName,
            family: item.family || "Unknown",
            genus: item.genus || "Unknown",
            conservationStatus: item.threatStatus || "NE",
            lastSync: new Date().toISOString(),
          };

          if (existingItem) {
            // Logic: Kya kuch badla hai?
            const isDifferent =
              existingItem.scientificName !== freshData.scientificName ||
              existingItem.conservationStatus !== freshData.conservationStatus;

            if (isDifferent) {
              // SAFE UPDATE: Purana data 'backup' field mein chala jayega aur FILE mein save hoga
              resultsMap.set(item.key, {
                ...freshData,
                isUpdated: true,
                backup: {
                  scientificName: existingItem.scientificName,
                  conservationStatus: existingItem.conservationStatus,
                  backupDate: existingItem.lastSync || new Date().toISOString(),
                },
              });
            }
            // Agar same hai toh kuch mat karo (Efficiency)
          } else {
            // Bilkul naya record
            resultsMap.set(item.key, freshData);
          }
        }
      });

      // --- STEP 2: Real-time Save to File ---
      // Har offset ke baad disk par write kar rahe hain taaki crash hone par data loss na ho
      const currentResults = Array.from(resultsMap.values());
      fs.writeFileSync(OUT_FILE, JSON.stringify(currentResults, null, 2));

      process.stdout.write(
        `\r  Live Count: ${resultsMap.size} | Offset: ${offset}`
      );

      offset += LIMIT;
      hasMore = !data.endOfRecords;
      await sleep(200);
    }
  }
  console.log(
    `\n✅ Mammal Discovery Done! Data and Backups are safe in ${OUT_FILE}`
  );
}

run().catch((err) => {
  console.error("\n Critical Error Occurred!", err);
});
