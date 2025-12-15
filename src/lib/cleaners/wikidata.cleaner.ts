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

// function getStringClaim(entity: any, prop: string): string | null {
//   const claims = entity.claims?.[prop]
//   if (!claims || !claims.length) return null

//   for (const claim of claims) {
//     const value = claim?.mainsnak?.datavalue?.value
//     if (typeof value === "string") {
//       return value
//     }
//   }

//   return null
// }

// export function extractWikidataFields(wikidata: any) {
//   const entity = wikidata.entities[Object.keys(wikidata.entities)[0]]

//   return {
//     scientificName: getStringClaim(entity, "P225")
//   }
// }

// function getFirstClaim(entity: any, prop: string) {
//   const claim = entity.claims?.[prop]?.[0]
//   return claim?.mainsnak?.datavalue?.value ?? null
// }
// function getFirstClaim(entity: any, prop: string) {
//   const claim = entity.claims?.[prop]?.[0]
//   const value = claim?.mainsnak?.datavalue?.value

//   if (!value) return null

//   // P225 often returns { text, language }
//   if (typeof value === "object" && "text" in value) {
//     return value.text
//   }

//   return value
// }

// export function extractSpeciesFields(wikidata: any) {
//   const entity = wikidata.entities[Object.keys(wikidata.entities)[0]]

//   const scientificName = getFirstClaim(entity, "P225")

//   // HARD GATE — NO SPECIES, NO ENTRY
//   if (!scientificName) {
//     throw new Error("Not a species-level entity (P225 missing)")
//   }

//   return {
//     scientificName,
//     taxonomy: {
//       taxonRank: getFirstClaim(entity, "P105"),
//       parentTaxon: getFirstClaim(entity, "P171")
//     }
//   }
// }

function getFirstClaim(entity: any, prop: string) {
  const claim = entity.claims?.[prop]?.[0];
  const value = claim?.mainsnak?.datavalue?.value;
  return value ?? null;
}

function getEntityId(value: any): string | null {
  if (!value) return null;
  if (value.id) return value.id;
  return null;
}

export function extractSpeciesFields(wikidata: any) {
  const entity = wikidata.entities[Object.keys(wikidata.entities)[0]];

  // Validate taxon
  const instanceOf = getFirstClaim(entity, "P31");
  const rank = getFirstClaim(entity, "P105");

  const instanceId = getEntityId(instanceOf);
  const rankId = getEntityId(rank);

  const isTaxon = instanceId === "Q16521";
  const isSpecies = rankId === "Q7432";
  const isSubspecies = rankId === "Q68947";

  if (!isTaxon) {
    throw new Error("Not a taxon");
  }

  if (isSubspecies) {
    return {
      type: "subspecies",
      scientificName: getFirstClaim(entity, "P225")?.text ?? null,
      parentQid: getFirstClaim(entity, "P171")?.id ?? null,
    };
  }

  if (!isSpecies) {
    throw new Error("Not a species-level taxon");
  }

  // Scientific name resolution
  let scientificName =
    getFirstClaim(entity, "P225")?.text ?? entity.labels?.la?.value ?? null;

  if (!scientificName) {
    throw new Error("Scientific name not found");
  }

  return {
    type: "species",
    scientificName,
    taxonomy: {
      taxonRank: rank,
      parentTaxon: getFirstClaim(entity, "P171"),
    },
  };
}
