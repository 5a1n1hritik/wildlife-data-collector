// import { Species } from "@/lib/types/species"

// export function cleanWikipediaSpecies(raw: any): Species {
//   return {
//     id: raw.title.toLowerCase().replace(/\s+/g, "-"),
//     name: raw.title,
//     scientificName: null, // later Wikidata se bharenge
//     wikibase_item: raw.wikibase_item ?? null,
//     description: raw.extract,
//     image: raw.originalimage?.source ?? raw.thumbnail?.source ?? null,
//     source: {
//       wikipedia: raw.content_urls.desktop.page
//     },
//     lastUpdated: new Date().toISOString().split("T")[0]
//   }
// }


import { fetchWikipediaSummary } from "@/lib/adapters/wikipedia.adapter"
import { Species } from "@/lib/types/species"

export async function enrichWithWikipedia(
  base: Species
): Promise<Species> {
  try {
    const wiki = await fetchWikipediaSummary(base.name)

    return {
      ...base,
      description: wiki.extract ?? null,
      image: wiki.originalimage?.source ?? wiki.thumbnail?.source ?? null,
      source: {
        ...base.source,
        wikipedia: wiki.content_urls.desktop.page
      }
    }
  } catch {
    // Wikipedia fails? Species still valid.
    return base
  }
}
