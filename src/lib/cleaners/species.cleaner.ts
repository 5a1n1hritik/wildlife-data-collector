import { Species } from "@/lib/types/species"

export function cleanWikipediaSpecies(raw: any): Species {
  return {
    id: raw.title.toLowerCase().replace(/\s+/g, "-"),
    name: raw.title,
    scientificName: null, // later Wikidata se bharenge
    description: raw.extract,
    image: raw.originalimage?.source ?? raw.thumbnail?.source ?? null,
    source: {
      wikipedia: raw.content_urls.desktop.page
    },
    lastUpdated: new Date().toISOString().split("T")[0]
  }
}
