import fs from "fs";
import path from "path";
import pLimit from "p-limit";

// --- Configuration ---
const OUT_FILE = "src/data/discovery/mammals/mammals.raw.json";
const TEMP_FILE = `${OUT_FILE}.tmp`;
const BASE_URL = "https://api.gbif.org/v1/species/search";
const CLASS_KEY = 359; // Mammalia
const LIMIT = 100;
const CONCURRENCY = 3;

const limit = pLimit(CONCURRENCY);
let resultsMap = new Map<number, any>();
let isShuttingDown = false;
let lastSaveCount = 0; // resultsMap.size;

// 1. Directory Setup
const dir = path.dirname(OUT_FILE);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 2. Persistent File Loading (Immortal Logic)
if (fs.existsSync(OUT_FILE)) {
  try {
    const content = fs.readFileSync(OUT_FILE, "utf-8").trim();
    const existing = content ? JSON.parse(content) : [];
    existing.forEach((m: any) => resultsMap.set(m.key, m));
    console.log(`Resuming: ${resultsMap.size} mammals loaded from disk.`);
  } catch (e) {
    console.error("File corrupt! Making backup and starting fresh.");
    fs.renameSync(OUT_FILE, `${OUT_FILE}.corrupt_${Date.now()}`);
  }
}

// 2. FIXED: Persistent Recovery Logic (Aapka bataya hua Smart Load)
function loadProgress() {
  let dataToLoad: any[] = [];
  const hasMain = fs.existsSync(OUT_FILE);
  const hasTemp = fs.existsSync(TEMP_FILE);

  try {
    if (hasTemp) {
      // Priority 1: Hamesha Temp file check karo, ye sabse up-to-date hoti hai
      const tempContent = fs.readFileSync(TEMP_FILE, "utf-8");
      dataToLoad = JSON.parse(tempContent);
      console.log(
        `Recovery: Loaded ${dataToLoad.length} records from TEMP.`
      );
    } else if (hasMain) {
      // Priority 2: Agar temp nahi hai, tab main file uthao
      const mainContent = fs.readFileSync(OUT_FILE, "utf-8");
      dataToLoad = JSON.parse(mainContent);
      console.log(`Resume: Loaded ${dataToLoad.length} records from MAIN.`);
    }

    dataToLoad.forEach((m: any) => resultsMap.set(m.key, m));
    lastSaveCount = resultsMap.size; // Counter sync karna zaroori hai
  } catch (e) {
    console.error("Data recovery failed. Starting fresh.");
  }
}

// 3. Atomic Save Function (Data Protection)
const saveData = (forceMainUpdate = false) => {
  if (resultsMap.size === 0) return;

  try {
    const dataArray = Array.from(resultsMap.values());
    // Pehle temporary file mein likhte hain
    fs.writeFileSync(TEMP_FILE, JSON.stringify(dataArray, null, 2));
    // 2. Logic: Agar 200 naye records aa gaye hain (last save se), tab swap karo
    // Isse restart ke baad bhi har 200 records par main file update hogi
    const newRecordsSinceLastSave = resultsMap.size - lastSaveCount;
    // tabhi main file ko swap karo taaki disk par pressure kam rahe
    if (forceMainUpdate || newRecordsSinceLastSave >= 200) {
      fs.renameSync(TEMP_FILE, OUT_FILE);
      lastSaveCount = resultsMap.size;
      console.log(
        `\n Checkpoint: ${resultsMap.size} records synced to main file.`
      );
      // console.log(`\n Saved ${resultsMap.size} records securely.`);
    }
  } catch (err) {
    console.error("\n Save Error:", err);
  }
};

// 4. Graceful Shutdown (Ctrl+C Handling)
process.on("SIGINT", () => {
  console.log("\n Shutdown signal received. Saving progress...");
  isShuttingDown = true;
  saveData(true);
  process.exit(0);
});

// 5. Smart Retry Fetch (Internet Loss Protection)
async function fetchWithRetry(
  url: string,
  retries = 5,
  backoff = 5000
): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (retries > 0 && !isShuttingDown) {
      console.log(
        `\n Connection lost. Retrying in ${
          backoff / 1000
        }s... (${retries} left)`
      );
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2);
    }
    throw err;
  }
}

// 4. THE FIX: Process Taxon (Deep Search)
async function processTaxon(
  taxonKey: number,
  orderName: string,
  label: string
) {
  let offset = 0;
  let hasMore = true;

  while (hasMore && !isShuttingDown) {
    const url = `${BASE_URL}?status=ACCEPTED&higherTaxonKey=${taxonKey}&limit=${LIMIT}&offset=${offset}&datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c`;

    const data = await fetchWithRetry(url);
    if (!data.results || data.results.length === 0) break;

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
          order: orderName, // order.canonicalName,
          family: item.family || "Unknown",
          genus: item.genus || "Unknown",
          conservationStatus: item.threatStatus || "NE",
          lastSync: new Date().toISOString(),
        };

        if (existingItem) {
          // Backup Logic: Agar data badla hai toh purana backup mein rakho
          const isDifferent =
            existingItem.scientificName !== freshData.scientificName ||
            existingItem.conservationStatus !== freshData.conservationStatus;

          if (isDifferent) {
            resultsMap.set(item.key, {
              ...freshData,
              isUpdated: true,
              backup: {
                oldName: existingItem.scientificName,
                conservationStatus: existingItem.conservationStatus,
                backupDate: existingItem.lastSync || new Date().toISOString(),
              },
            });
          }
        } else {
          resultsMap.set(item.key, freshData);
        }
      }
    });

    // Immediate persistence after each batch
    saveData();

    process.stdout.write(
      `\r  Total: ${resultsMap.size} | Offset: ${offset} | Current: ${orderName} | Scan: ${label}`
    );

    offset += LIMIT;
    hasMore = !data.endOfRecords && offset < 10000;

    // Small delay to prevent API blocking
    await new Promise((r) => setTimeout(r, 200));
  }
}

// 6. Main Discovery Loop
async function startMammalDiscovery() {
  console.log(" Starting Professional Mammal Discovery...");

  try {
    // Get Orders
    const orderUrl = `${BASE_URL}?rank=ORDER&status=ACCEPTED&higherTaxonKey=${CLASS_KEY}&limit=100`;
    const orderData = await fetchWithRetry(orderUrl);
    const orders = orderData.results.filter(
      (o: any) => o.classKey === CLASS_KEY
    );

    for (const order of orders) {
      if (isShuttingDown) break;
      console.log(`\n Order: ${order.canonicalName.toUpperCase()}`);

      // Families check for deep search
      const famData = await fetchWithRetry(
        `${BASE_URL}?rank=FAMILY&status=ACCEPTED&higherTaxonKey=${order.key}&limit=100`
      );
      const families = famData.results || [];

      if (families.length > 0) {
        // Deep search via families (No 10k limit issue)
        for (const family of families) {
          if (isShuttingDown) break;
          await processTaxon(
            family.key,
            order.canonicalName,
            family.canonicalName
          );
        }
      } else {
        // Direct search if no families found
        await processTaxon(order.key, order.canonicalName, order.canonicalName);
      }
    }

    console.log(`\n Finished! Total Mammals: ${resultsMap.size}`);
    console.log(
      `\n Mammal Discovery Done! Data and Backups are safe in ${OUT_FILE}`
    );
    saveData(true);
  } catch (error) {
    console.error("\n Critical Error:", error);
    saveData(true);
  }
}

// Start the process
loadProgress(); // Script shuru hote hi load karein

startMammalDiscovery().catch((err) => {
  console.error("\n Critical Error occurred!", err);
  saveData(); // Pehle data save karo
  process.exit(1); // Phir exit karo
});
