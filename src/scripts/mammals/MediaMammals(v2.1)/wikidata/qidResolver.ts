import { secureFetch } from "../network/fetcher.ts";
import { getCachedQID, setCachedQID } from "../state/qidCache.ts";
import { state } from "../state/state.ts";

export function cleanScientificName(item: any): string {
  if (!item || !item.scientificName) return "";

  // remove extra metadata
  let baseName = item.scientificName
    .replace(/\(.*\)/g, "") // Remove brakets ()
    .replace(/[^a-zA-Z\s-]/g, "") // Remove numbers or symbols
    .trim();

  const words = baseName.split(/\s+/);

  // 2. accouding to Rank decide words
  if (item.rank === "SUBSPECIES" && words.length >= 3) {
    return words.slice(0, 3).join(" "); // Trinomial: 3 words
  }

  return words.slice(0, 2).join(" "); // Binomial: 2 words
}

export async function getQID(item: any) {
  const cleanName = cleanScientificName(item);
  if (!cleanName) return null;

  const cached = getCachedQID(cleanName);
  if (cached !== undefined) return cached; // null bhi return hone do

  try {
    const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=en&format=json&origin=*`;

    const res = await secureFetch(wikidataUrl);
    let qid: string | null = null;

    if (res.search && res.search.length > 0) {
      // return res.search[0].id;
      qid = res.search[0].id;
      (item as any)._qidSource = "direct";
    } else {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(cleanName)}&format=json&origin=*&redirects=1`;
      const wikiRes = await secureFetch(wikiUrl);

      const pages = wikiRes.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        qid = pages[pageId]?.pageprops?.wikibase_item ?? null;
        // if (qid) return qid;
      }
    }
    
    // SUBSPECIES fallback → species binomial
    if (!qid && item.rank === "SUBSPECIES") {
      const parts = cleanName.split(" ");
      if (parts.length >= 2) {
        const speciesName = parts.slice(0, 2).join(" ");

        const cachedSpecies = getCachedQID(speciesName);
        if (cachedSpecies !== undefined) {
          qid = cachedSpecies;
        } else {
          const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
            speciesName,
          )}&language=en&format=json&origin=*`;

          const res2 = await secureFetch(url);
          if (res2.search && res2.search.length > 0) {
            qid = res2.search[0].id;
            setCachedQID(speciesName, qid);
            (item as any)._qidSource = "species-fallback";
          } else {
            setCachedQID(speciesName, null);
          }
        }
      }
    }

    if (qid) {
      setCachedQID(cleanName, qid); // cache it
    } else {
      setCachedQID(cleanName, null);  // negative cache
    }

    return qid;
  } catch (e) {
    // state.stats.errors++;
    console.error(`Network error while finding QID for ${cleanName}:`, e);
    return null;
  }
}
