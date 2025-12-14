// export interface Species {
//   id: string
//   name: string
//   scientificName?: string | null
//   wikibase_item?: string | null
//   taxonomy?: {
//     kingdom?: string
//     phylum?: string
//     class?: string
//     order?: string
//     family?: string
//     genus?: string
//   }
//   description: string
//   image?: string | null
//   source: {
//     wikipedia: string
//     wikidata?: string
//   }
//   lastUpdated: string
// }


export interface Species {
  id: string
  name: string

  scientificName: string
  wikibase_item: string

  taxonomy?: {
    taxonRank?: any
    parentTaxon?: any
  }

  description?: string | null
  image?: string | null

  source: {
    wikidata: string
    wikipedia?: string
  }

  lastUpdated: string
}
