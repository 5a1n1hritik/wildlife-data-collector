// import { fetchWikipediaSummary } from "@/lib/adapters/wikipedia.adapter"
// import { cleanWikipediaSpecies } from "@/lib/cleaners/species.cleaner"
// import { writeFile, mkdir } from "fs/promises"
// import path from "path"

// export async function GET(req: Request) {
//   const { searchParams } = new URL(req.url)
//   const title = searchParams.get("title")

//   if (!title) {
//     return new Response("Missing title", { status: 400 })
//   }

//   try {
//     const raw = await fetchWikipediaSummary(title)
//     const cleaned = cleanWikipediaSpecies(raw)

//     const dirPath = path.join(process.cwd(), "src/data/species")
//     const filePath = path.join(dirPath, `${cleaned.id}.json`)

//     await mkdir(dirPath, { recursive: true })
//     await writeFile(filePath, JSON.stringify(cleaned, null, 2))

//     return Response.json({
//       success: true,
//       storedAs: `${cleaned.id}.json`
//     })
//   } catch (err: any) {
//     return new Response(err.message, { status: 500 })
//   }
// }


import speciesList from "@/data/input/species-list.json"
import { fetchWikipediaSummary } from "@/lib/adapters/wikipedia.adapter"
import { cleanWikipediaSpecies } from "@/lib/cleaners/species.cleaner"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST() {
  const baseDir = path.join(process.cwd(), "src/data/species")
  await mkdir(baseDir, { recursive: true })

  for (const [category, speciesArr] of Object.entries(speciesList)) {
    const categoryDir = path.join(baseDir, category)
    await mkdir(categoryDir, { recursive: true })

    for (const name of speciesArr) {
      const raw = await fetchWikipediaSummary(name)
      const cleaned = cleanWikipediaSpecies(raw)

      const filePath = path.join(categoryDir, `${cleaned.id}.json`)
      await writeFile(filePath, JSON.stringify(cleaned, null, 2))
    }
  }

  return Response.json({ success: true })
}
