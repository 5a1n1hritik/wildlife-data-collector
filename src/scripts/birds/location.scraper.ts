import fs from "fs";
import pLimit from "p-limit";

const INPUT_FILE = "src/data/discovery/birds.enriched.json";
const OUTPUT_FILE = "src/data/discovery/birds.final.json";
const CONCURRENCY = 5; 
const BATCH_SIZE = 50; 

const limit = pLimit(CONCURRENCY);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

let finalData: any[] = [];
let isShuttingDown = false; 

if (fs.existsSync(OUTPUT_FILE)) {
  try {
    const content = fs.readFileSync(OUTPUT_FILE, "utf-8").trim();
    finalData = content ? JSON.parse(content) : [];
    console.log(`Resume from: ${finalData.length} birds.`);
  } catch (e) {
    console.error(" Output file corrupt. Resetting to [].");
    finalData = [];
  }
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
  let url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&limit=5&hasCoordinate=true&basisOfRecord=HUMAN_OBSERVATION`;
  try {
    let res = await fetch(url);
    let data = await res.json();

    if (!data.results || data.results.length === 0) {
      url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&limit=5&hasCoordinate=true`;
      res = await fetch(url);
      data = await res.json();
    }
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

    const uniqueCountries = new Set<string>();
    data.results.forEach((dist: any) => {
      if (dist.country && dist.occurrenceStatus !== "ABSENT") {
        uniqueCountries.add(dist.country as string);
      }
    });
    return Array.from(uniqueCountries);
  } catch {
    return [];
  }
}

async function startLocationEnrichment() {
  const enrichedBirds = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const remaining = enrichedBirds.slice(finalData.length);

  console.log(`Starting Phase 3: Location Discovery for ${remaining.length} birds...`);

  for (let i = 0; i < remaining.length; i++) {
    if (isShuttingDown) break;

    const bird = remaining[i];
    try {
      const result = await limit(async () => {
        process.stdout.write(
          `\r[${finalData.length + 1}/${enrichedBirds.length}] Mapping: ${
            bird.canonicalName
          }... `
        );

        const [points, distCodes] = await Promise.all([
          getLocations(bird.key),
          getDistributions(bird.key),
        ]);

        const sightingCodes = new Set<string>(
          points.map((p: { country: any; }) => p.country).filter(Boolean)
        );

        let finalCountries: string[] = [];

        if (sightingCodes.size > 0) {
          finalCountries = Array.from(sightingCodes);
        } else {
          finalCountries = distCodes;
        }

        const globalBlacklist = ["NO", "AQ"];
        const filteredCountries = finalCountries.filter((code) => !globalBlacklist.includes(code));

        const nativeCountries = filteredCountries.map((code) => ({
          countryCode: code,
        }));

        return {
          ...bird,
          location: {
            recentSightings: points,
            nativeCountries: nativeCountries,
            mapLayerUrl: `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}.mvt?taxonKey=${bird.key}&style=classic.poly&bin=hex`,
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

  }

  saveData();
  console.log("\n PHASE 3 COMPLETE! Your final dataset is ready.");
}

startLocationEnrichment().catch((err) => {
  console.error("\n Critical Error occurred!", err);
  saveData();
  process.exit(1);
});
