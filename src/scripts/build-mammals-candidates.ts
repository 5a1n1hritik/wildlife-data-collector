import fs from "fs/promises"
import path from "path"

type RawDiscoveryItem = {
  id: string
  name?: string
  scientificName?: string
  wikibase_item: string
}

async function run() {
  const inputPath = path.join(
    process.cwd(),
    "src/data/discovery/mammals.raw.json"
  )

  const outputPath = path.join(
    process.cwd(),
    "src/data/input/mammals.candidates.json"
  )

  const raw: RawDiscoveryItem[] = JSON.parse(
    await fs.readFile(inputPath, "utf-8")
  )

  const candidates = raw
    .filter(item =>
      item.scientificName &&               // species has P225
      item.wikibase_item &&                // has Q-ID
      /^[A-Z][a-z]+ [a-z]+/.test(item.scientificName) // binomial sanity
    )
    .map(item => ({
      id: item.scientificName!
        .toLowerCase()
        .replace(/\s+/g, "-"),
      name: item.name ?? item.scientificName!,
      wikibase_item: item.wikibase_item,
      scientificName: item.scientificName
    }))

  await fs.writeFile(
    outputPath,
    JSON.stringify(candidates, null, 2)
  )

  console.log(`✅ Candidates generated: ${candidates.length}`)
}

run().catch(console.error)
