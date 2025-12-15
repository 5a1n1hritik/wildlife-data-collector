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
import { fetchWikidataEntity } from "@/lib/adapters/wikidata.adapter";
import { extractSpeciesFields } from "@/lib/cleaners/wikidata.cleaner";
import { enrichWithWikipedia } from "@/lib/cleaners/species.cleaner";
import { Species } from "@/lib/types/species";
import fs from "fs";

const BATCH_SIZE = 50;
const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

const SUBSPECIES_LOG = "src/data/logs/mammals.subspecies.json";

function logSubspecies(entry: any) {
  const existing = fs.existsSync(SUBSPECIES_LOG)
    ? JSON.parse(fs.readFileSync(SUBSPECIES_LOG, "utf-8"))
    : [];

  existing.push(entry);

  fs.writeFileSync(SUBSPECIES_LOG, JSON.stringify(existing, null, 2));
}

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

    // Wikipedia sitelink
    const wikiTitle = entity.sitelinks?.enwiki?.title ?? null;
    const wikipediaUrl = wikiTitle
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
          wikiTitle.replace(/ /g, "_")
        )}`
      : null;

    // Image (P18)
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
        wikipedia: wikipediaUrl,
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

export async function POST() {
  const inputPath = path.join(
    process.cwd(),
    "src/data/input/mammals.species.json"
  );

  const outDir = path.join(process.cwd(), "src/data/species/mammals");

  await mkdir(outDir, { recursive: true });

  const speciesList = JSON.parse(await readFile(inputPath, "utf-8"));
  for (let i = 0; i < speciesList.length; i += BATCH_SIZE) {
    const batch = speciesList.slice(i, i + BATCH_SIZE);

    console.log(`🚀 Processing batch ${i} → ${i + batch.length}`);

    for (const item of batch) {
      try {
        const wikidata = await fetchWikidataEntity(item.wikibase_item);
        const wd = extractSpeciesFields(wikidata);

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
              image: null, // optional: baad me WD P18 se fill kar sakte ho
            },
            parentSpecies: parentInfo,
            reason: "taxon rank = subspecies",
            timestamp: new Date().toISOString(),
          });

          console.log(
            `[SKIPPED] ${item.id} (${item.wikibase_item}) _ Subspecies logged with parent`
          );

          continue;
        }

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
      } catch (err) {
        console.error(
          `[SKIPPED] ${item.id} (${item.wikibase_item}) → ${
            (err as Error).message
          }`
        );
      }
    }
    await sleep(DELAY_MS);
  }

  return Response.json({ success: true });
}
