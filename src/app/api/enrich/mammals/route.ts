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
import { enrichWithWikipedia } from "@/lib/cleaners/species.cleaner"
import { Species } from "@/lib/types/species"

export async function POST() {
  const inputPath = path.join(
    process.cwd(),
    "src/data/input/mammals.species.json"
  );

  const outDir = path.join(process.cwd(), "src/data/species/mammals");

  await mkdir(outDir, { recursive: true });

  const speciesList = JSON.parse(await readFile(inputPath, "utf-8"));

  for (const item of speciesList) {
    try {
      const wikidata = await fetchWikidataEntity(item.wikibase_item);
      const wd = extractSpeciesFields(wikidata);

      let payload: Species = {
        id: item.id,
        name: item.name,
        scientificName: wd.scientificName,
        wikibase_item: item.wikibase_item,
        taxonomy: wd.taxonomy,
        source: {
          wikidata: `https://www.wikidata.org/wiki/${item.wikibase_item}`
        },
        lastUpdated: new Date().toISOString().split("T")[0]
      }

      payload = await enrichWithWikipedia(payload)

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

  return Response.json({ success: true });
}


