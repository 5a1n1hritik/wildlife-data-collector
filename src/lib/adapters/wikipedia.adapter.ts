export async function fetchWikipediaSummary(title: string) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`

  const res = await fetch(url, {
    headers: {
      "User-Agent": "wildlife-data-collector/1.0"
    }
  })

  if (!res.ok) {
    throw new Error(`Wikipedia fetch failed for ${title}`)
  }

  return res.json()
}
