export function normalizeDiscoveryResults(raw: any) {
  return raw.results.bindings.map((row: any) => {
    const qid = row.item.value.split("/").pop();

    return {
      id: row.scientificName.value
        .toLowerCase()
        .replace(/\s+/g, "-"),
      name: row.itemLabel.value,
      scientificName: row.scientificName.value,
      wikibase_item: qid
    };
  });
}


// src/lib/cleaners/discovery.cleaner.ts
export function normalizeGBIFBirds(results: any[]) {
  return results
    .filter(r => r.scientificName && r.canonicalName)
    .map(r => ({
      id: r.canonicalName
        .toLowerCase()
        .replace(/\s+/g, "-"),
      name: r.vernacularName || r.canonicalName,
      scientificName: r.scientificName,
      gbif_id: r.key,
      taxonomy: {
        kingdom: r.kingdom,
        phylum: r.phylum,
        class: r.class,
        order: r.order,
        family: r.family,
        genus: r.genus
      },
      source: {
        gbif: `https://www.gbif.org/species/${r.key}`
      }
    }));
}
