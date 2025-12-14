// function getValue(entity: any, prop: string) {
//   const claim = entity.claims?.[prop]?.[0]
//   return claim?.mainsnak?.datavalue?.value ?? null
// }

// export function extractWikidataFields(wikidata: any) {
//   const entity = Object.values(wikidata.entities)[0] as any

//   return {
//     scientificName: getValue(entity, "P225"),
//     taxonomy: {
//       kingdom: getValue(entity, "P105"), // taxon rank (placeholder)
//       family: getValue(entity, "P279"),
//       genus: getValue(entity, "P171")
//     }
//   }
// }


function getStringClaim(entity: any, prop: string): string | null {
  const claims = entity.claims?.[prop]
  if (!claims || !claims.length) return null

  for (const claim of claims) {
    const value = claim?.mainsnak?.datavalue?.value
    if (typeof value === "string") {
      return value
    }
  }

  return null
}

export function extractWikidataFields(wikidata: any) {
  const entity = wikidata.entities[Object.keys(wikidata.entities)[0]]

  return {
    scientificName: getStringClaim(entity, "P225")
  }
}
