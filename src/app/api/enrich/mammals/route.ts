// import { readFile, writeFile } from "fs/promises"
// import path from "path"
// import { fetchWikidataEntity } from "@/lib/adapters/wikidata.adapter"
// import { extractWikidataFields } from "@/lib/cleaners/wikidata.cleaner"

// export async function POST() {
//   const mammalsDir = path.join(process.cwd(), "src/data/species/mammals.species.json")
//   const files = await import("fs").then(fs =>
//     fs.readdirSync(mammalsDir)
//   )

//   for (const file of files) {
//     const filePath = path.join(mammalsDir, file)
//     const species = JSON.parse(await readFile(filePath, "utf-8"))

//     // Wikipedia Q-id store karna zaroori tha
//     if (!species.source?.wikidata && species.wikibase_item) {
//       species.source.wikidata = `https://www.wikidata.org/wiki/${species.wikibase_item}`
//     }

//     if (!species.wikibase_item) continue

//     const wikidata = await fetchWikidataEntity(species.wikibase_item)
//     const enriched = extractWikidataFields(wikidata)

//     Object.assign(species, enriched)
//     species.lastUpdated = new Date().toISOString().split("T")[0]

//     await writeFile(filePath, JSON.stringify(species, null, 2))
//   }

//   return Response.json({ success: true })
// }

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import fs from "fs";

import { fetchWikidataEntity } from "@/lib/adapters/wikidata.adapter";
import { extractSpeciesFields } from "@/lib/cleaners/wikidata.cleaner";
import { enrichWithWikipedia } from "@/lib/cleaners/species.cleaner";
import { Species } from "@/lib/types/species";

const BATCH_SIZE = 50;
const DELAY_MS = 1000;

const SUBSPECIES_LOG = "src/data/logs/mammals.subspecies.json";
const SKIPPED_LOG = "src/data/logs/mammals.skipped.json";

const startTime = Date.now();

function formatTime(ms: number) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

function renderProgressBar(current: number, total: number, width = 40) {
  const percent = current / total;
  const filled = Math.round(percent * width);
  const empty = width - filled;

  return `[${"#".repeat(filled)}${"_".repeat(empty)}]`;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ----------------------- LOG HELPERS ----------------------- */

function appendJSON(filePath: string, entry: any) {
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
    : [];

  existing.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
}

function logSubspecies(entry: any) {
  appendJSON(SUBSPECIES_LOG, entry);
}

function logSkipped(entry: any) {
  appendJSON(SKIPPED_LOG, entry);
}

/* ---------------- PARENT SPECIES FETCH -------------------- */

async function fetchParentSpeciesInfo(parentQid: string | null) {
  if (!parentQid) return null;

  try {
    const wd = await fetchWikidataEntity(parentQid);
    const entity = wd.entities[Object.keys(wd.entities)[0]];

    const scientificName =
      entity.claims?.P225?.[0]?.mainsnak?.datavalue?.value?.text ??
      entity.labels?.la?.value ??
      null;

    const label = entity.labels?.en?.value ?? null;

    const wikiTitle = entity.sitelinks?.enwiki?.title ?? null;
    const wikipedia = wikiTitle
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
          wikiTitle.replace(/ /g, "_")
        )}`
      : null;

    const imageName =
      entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;

    const image = imageName
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
          imageName
        )}`
      : null;

    return {
      qid: parentQid,
      scientificName,
      label,
      source: {
        wikidata: `https://www.wikidata.org/wiki/${parentQid}`,
        wikipedia,
      },
      image,
    };
  } catch {
    return {
      qid: parentQid,
      scientificName: null,
      label: null,
      source: {
        wikidata: `https://www.wikidata.org/wiki/${parentQid}`,
      },
      image: null,
    };
  }
}

/* --------------------------- API --------------------------- */

export async function POST() {
  const inputPath = path.join(
    process.cwd(),
    "src/data/input/mammals.species.json"
  );

  const outDir = path.join(process.cwd(), "src/data/species/mammals");
  await mkdir(outDir, { recursive: true });

  const speciesList = JSON.parse(await readFile(inputPath, "utf-8"));
  const total = speciesList.length;

  // 🧠 SANITY COUNTERS
  let processed = 0;
  let speciesCount = 0;
  let subspeciesCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < speciesList.length; i += BATCH_SIZE) {
    const batch = speciesList.slice(i, i + BATCH_SIZE);

    console.log(`🚀 Batch ${i} → ${i + batch.length}`);

    for (const item of batch) {
      try {
        const wikidata = await fetchWikidataEntity(item.wikibase_item);
        const wd = extractSpeciesFields(wikidata);

        /* ------------ SUBSPECIES HANDLING ------------ */
        if (wd.type === "subspecies") {
          const parentInfo = await fetchParentSpeciesInfo(wd.parentQid);

          logSubspecies({
            subspecies: {
              qid: item.wikibase_item,
              scientificName: wd.scientificName,
              label: item.name,
              source: {
                wikidata: `https://www.wikidata.org/wiki/${item.wikibase_item}`,
                wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(
                  item.name.replace(/ /g, "_")
                )}`,
              },
              image: null,
            },
            parentSpecies: parentInfo,
            reason: "taxon rank = subspecies",
            timestamp: new Date().toISOString(),
          });

          subspeciesCount++;
          processed++;

          // console.log(`[SUBSPECIES] ${processed}/${total} → ${item.id}`);

          continue;
        }

        /* ---------------- SPECIES ---------------- */

        let payload: Species = {
          id: item.id,
          name: item.name,
          scientificName: wd.scientificName,
          wikibase_item: item.wikibase_item,
          taxonomy: wd.taxonomy,
          source: {
            wikidata: `https://www.wikidata.org/wiki/${item.wikibase_item}`,
          },
          lastUpdated: new Date().toISOString().split("T")[0],
        };

        payload = await enrichWithWikipedia(payload);

        const filePath = path.join(outDir, `${item.id}.json`);
        await writeFile(filePath, JSON.stringify(payload, null, 2));

        speciesCount++;
        processed++;

        // console.log(`[SPECIES] ${processed}/${total} → ${item.id}`);
      } catch (err) {
        skippedCount++;
        processed++;

        logSkipped({
          id: item.id,
          qid: item.wikibase_item,
          name: item.name,
          reason: (err as Error).message,
          timestamp: new Date().toISOString(),
        });

        // console.error(`[SKIPPED] ${processed}/${total} → ${item.id}`);
      }
    }

    //     console.log(`
    // 📊 PROGRESS
    // -----------
    // Processed   : ${processed}/${total}
    // Species     : ${speciesCount}
    // Subspecies  : ${subspeciesCount}
    // Skipped     : ${skippedCount}
    // Remaining   : ${total - processed}
    // `);
    const elapsed = Date.now() - startTime;
    const avgPerItem = elapsed / processed;
    const remainingMs = avgPerItem * (total - processed);

    console.clear();
    console.log(`
PROGRESS
-----------
Processed   : ${processed}/${total} ${renderProgressBar(processed, total)}
Species     : ${speciesCount}
Subspecies  : ${subspeciesCount}
Skipped     : ${skippedCount}
Remaining   : ${total - processed}

Time Elapsed: ${formatTime(elapsed)}
ETA         : ${formatTime(remainingMs)}
`);

    await sleep(DELAY_MS);
  }

  return Response.json({
    success: true,
    total,
    processed,
    species: speciesCount,
    subspecies: subspeciesCount,
    skipped: skippedCount,
  });
}
