import fs from "fs";
import path from "path";

const OUT_FILE = "src/data/discovery/birds.raw.json";
const BASE_URL = "https://api.gbif.org/v1/species/search";
const LIMIT = 100;
const SLEEP = 250;

// -----------------------------
// utils
// -----------------------------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function safeFetch(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GBIF error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Fetch failed for: ${url}`);
    return null;
  }
}

// -----------------------------
// 1️⃣ Resolve Aves taxonKey
// -----------------------------
async function getAvesKey(): Promise<number> {
  const data = await safeFetch(
    "https://api.gbif.org/v1/species/match?name=Aves&rank=CLASS"
  );

  if (!data.usageKey) {
    throw new Error("Aves taxonKey not found");
  }

  return data.usageKey;
}

// -----------------------------
// 2️⃣ Fetch bird ORDERS
// -----------------------------
// async function getBirdOrders(avesKey: number) {
//   const url =
//     `${BASE_URL}?` +
//     new URLSearchParams({
//       rank: "ORDER",
//       status: "ACCEPTED",
//       taxonKey: String(avesKey),
//       limit: "100",
//     });

//   const data = await safeFetch(url);

//   return data.results.map((o: any) => ({
//     key: o.key,
//     name: o.canonicalName,
//   }));
// }

// -----------------------------
// 3️⃣ Fetch species per ORDER
// -----------------------------
// async function fetchSpeciesByOrder(orderKey: number, offset: number) {
//   const url =
//     `${BASE_URL}?` +
//     new URLSearchParams({
//       rank: "SPECIES",
//       status: "ACCEPTED",
//       nameType: "SCIENTIFIC",
//       taxonKey: String(orderKey),
//       limit: String(LIMIT),
//       offset: String(offset),
//     });

//   return safeFetch(url);
// }

// -----------------------------
// 4️⃣ Main runner
// -----------------------------
// async function run() {
//   console.log("🦅 Starting GBIF bird discovery");

//   const avesKey = await getAvesKey();
//   console.log(`Resolved Aves taxonKey: ${avesKey}`);

//   const orders = await getBirdOrders(avesKey);
//   console.log(`Bird orders found: ${orders.length}`);

//   const results: any[] = [];

//   for (const order of orders) {
//     console.log(`\n🟦 Order: ${order.name}`);

//     let offset = 0;
//     let total = 0;
//     let initialized = false;

//     while (true) {
//       console.log(`  Fetching ${offset} → ${offset + LIMIT}`);

//       const data = await fetchSpeciesByOrder(order.key, offset);

//       if (!initialized) {
//         total = data.count;
//         initialized = true;
//         console.log(`  Total species in order: ${total}`);
//       }

//       for (const item of data.results) {
//         if (!item.canonicalName) continue;

//         results.push({
//           gbif_id: item.key,
//           scientificName: item.scientificName,
//           canonicalName: item.canonicalName,
//           order: order.name,
//           source: {
//             gbif: `https://www.gbif.org/species/${item.key}`,
//           },
//         });
//       }

//       offset += LIMIT;
//       if (offset >= total) break;

//       await sleep(SLEEP);
//     }
//   }

//   fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
//   fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

//   console.log("\n✅ Bird discovery complete");
//   console.log(`Total bird species (raw): ${results.length}`);
// }

// // -----------------------------
// run().catch(err => {
//   console.error("❌ Discovery failed:", err.message);
//   process.exit(1);
// });

// ... (Keep your imports and safeFetch as is)

async function getBirdOrders(avesKey: number) {
  // Yahan hum strict filter laga rahe hain taaki sirf Aves ke orders milein
  const url = `${BASE_URL}?` + new URLSearchParams({
    rank: "ORDER",
    status: "ACCEPTED",
    higherTaxonKey: String(avesKey), // Use higherTaxonKey for strictness
    limit: "100", 
  });

  const data = await safeFetch(url);
  // Filter karein taaki sirf wahi orders bachein jinka class Aves ho
  return data.results
    .filter((o: any) => o.classKey === avesKey) 
    .map((o: any) => ({
      key: o.key,
      name: o.canonicalName,
    }));
}

async function run() {
  console.log("🦅 Starting STRICT GBIF bird discovery...");

  const avesKey = await getAvesKey(); // Should be 212
  const orders = await getBirdOrders(avesKey);
  console.log(`Verified Bird orders found: ${orders.length}`);

  const results: any[] = [];

  for (const order of orders) {
    console.log(`\n🟦 Fetching Order: ${order.name}`);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // GBIF Offset limit check (Safety)
      if (offset >= 10000) {
        console.log("  ⚠️ Reached GBIF 10k limit for this order.");
        break;
      }

      const url = `${BASE_URL}?` + new URLSearchParams({
        rank: "SPECIES",
        status: "ACCEPTED",
        higherTaxonKey: String(order.key), // Strict order key
        limit: String(LIMIT),
        offset: String(offset),
        datasetKey: "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c" 
      });

      const data = await safeFetch(url);
      
      // Error handling for failed fetch
      if (!data || !data.results) {
        console.log(`  ❌ Failed to fetch at offset ${offset}`);
        break; 
      }

      if (data.results.length === 0) break;

      for (const item of data.results) {
        // Double check: Sirf wahi species jinka class Aves ho
        if (item.canonicalName && item.classKey === avesKey) {
          results.push({
            key: item.key,
            scientificName: item.scientificName,
            canonicalName: item.canonicalName,
            vernacularName: item.vernacularName,
            order: order.name,
            family: item.family,
            genus: item.genus,
            conservationStatus: item.threatStatus || "NE", // NE = Not Evaluated
          });
        }
      }

      console.log(`  Fetched ${results.length} total valid birds...`);
      
      offset += LIMIT;
      hasMore = !data.endOfRecords;
      await sleep(SLEEP);
    }
  }

  // File saving logic...

  // Save data
  const dir = path.dirname(OUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  console.log(`\n✅ Done! Total Birds Collected: ${results.length}`);
}

run().catch(console.error);