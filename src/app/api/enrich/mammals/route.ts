import { readFile, writeFile } from "fs/promises"
import path from "path"
import { fetchWikidataEntity } from "@/lib/adapters/wikidata.adapter"
import { extractWikidataFields } from "@/lib/cleaners/wikidata.cleaner"

export async function POST() {
  const mammalsDir = path.join(process.cwd(), "src/data/species/mammals")
  const files = await import("fs").then(fs =>
    fs.readdirSync(mammalsDir)
  )

  for (const file of files) {
    const filePath = path.join(mammalsDir, file)
    const species = JSON.parse(await readFile(filePath, "utf-8"))

    // Wikipedia Q-id store karna zaroori tha
    if (!species.source?.wikidata && species.wikibase_item) {
      species.source.wikidata = `https://www.wikidata.org/wiki/${species.wikibase_item}`
    }

    if (!species.wikibase_item) continue

    const wikidata = await fetchWikidataEntity(species.wikibase_item)
    const enriched = extractWikidataFields(wikidata)

    Object.assign(species, enriched)
    species.lastUpdated = new Date().toISOString().split("T")[0]

    await writeFile(filePath, JSON.stringify(species, null, 2))
  }

  return Response.json({ success: true })
}
