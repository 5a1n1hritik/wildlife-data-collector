import fs from "fs";
import pLimit from "p-limit";

const INPUT_FILE = "src/data/discovery/birds.enriched.json";
const OUTPUT_FILE = "src/data/discovery/birds.final.json";
const CONCURRENCY = 5; // Location API fast hai, toh 5 parallel requests safe hain
const BATCH_SIZE = 50; // Chota batch rakhte hain safety ke liye

const limit = pLimit(CONCURRENCY);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

let finalData: any[] = [];
let isShuttingDown = false; // Flag for graceful shutdown

if (fs.existsSync(OUTPUT_FILE)) {
  try {
    const content = fs.readFileSync(OUTPUT_FILE, "utf-8").trim();
    finalData = content ? JSON.parse(content) : [];
    console.log(`Resume from: ${finalData.length} birds.`);
  } catch (e) {
    console.error(" Output file corrupt. Resetting to [].");
    finalData = [];
  }
  // finalData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
}

// Helper: Save function
const saveData = () => {
  console.log(`\n Saving ${finalData.length} records to file...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
};

// Signal Listeners: Ctrl+C handle karne ke liye
process.on("SIGINT", () => {
  console.log("\n Shutdown signal received (Ctrl+C). Saving progress...");
  isShuttingDown = true;
  saveData();
  process.exit();
});

// 1. Fetch Lat/Lng Points (Recent sightings)
async function getLocations(taxonKey: number) {
  const url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&limit=5&hasCoordinate=true&basisOfRecord=HUMAN_OBSERVATION`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results.map((occ: any) => ({
      lat: occ.decimalLatitude,
      lng: occ.decimalLongitude,
      country: occ.countryCode,
      date: occ.eventDate,
    }));
  } catch {
    return [];
  }
}

// 2. Fetch Countries where bird is native
async function getDistributions(taxonKey: number) {
  const url = `https://api.gbif.org/v1/species/${taxonKey}/distributions`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results
      .filter((d: any) => d.country)
      .map((d: any) => ({
        countryCode: d.country,
        status: d.occurrenceStatus || "PRESENT",
      }));
  } catch {
    return [];
  }
}

async function startLocationEnrichment() {
  const enrichedBirds = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const remaining = enrichedBirds.slice(finalData.length);

  console.log(
    `Starting Phase 3: Location Discovery for ${remaining.length} birds...`
  );

  for (let i = 0; i < remaining.length; i++) {
    // Agar Ctrl+C press hua hai toh loop se bahar aa jao
    if (isShuttingDown) break;

    const bird = remaining[i];
    try {
      const result = await limit(async () => {
        process.stdout.write(
          `\r[${finalData.length + 1}/${enrichedBirds.length}] Mapping: ${
            bird.canonicalName
          }... `
        );

        const [points, countries] = await Promise.all([
          getLocations(bird.key),
          getDistributions(bird.key),
        ]);

        return {
          ...bird,
          location: {
            recentSightings: points,
            nativeCountries: Array.from(
              new Set(countries.map((c: any) => c.countryCode))
            ), // Unique country codes
          },
        };
      });

      finalData.push(result);

      // Save every BATCH_SIZE complete
      if (finalData.length % BATCH_SIZE === 0) {
        saveData();
      }

      await sleep(150);
    } catch (err) {
      console.error(
        `\n Error processing ${bird.canonicalName}. Saving and continuing...`
      );
      saveData();
    }

    saveData();
    console.log("\n PHASE 3 COMPLETE! Your final dataset is ready.");
  }
}

startLocationEnrichment().catch((err) => {
  console.error("\n Critical Error occurred!");
  console.error(err);
  saveData(); // Pehle data save karo
  process.exit(1); // Phir exit karo
});
