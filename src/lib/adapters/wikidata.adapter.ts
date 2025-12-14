export async function fetchWikidataEntity(qid: string) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Wikidata fetch failed for ${qid}`)
  }

  return res.json()
}
