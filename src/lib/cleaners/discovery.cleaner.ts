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
