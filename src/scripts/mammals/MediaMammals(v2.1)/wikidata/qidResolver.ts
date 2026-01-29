import { secureFetch } from "../network/fetcher.ts";
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

  try {
    const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=en&format=json&origin=*`;

    const res = await secureFetch(wikidataUrl);
    if (res.search && res.search.length > 0) {
      return res.search[0].id;
    }

    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(cleanName)}&format=json&origin=*&redirects=1`;
    const wikiRes = await secureFetch(wikiUrl);

    const pages = wikiRes.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const qid = pages[pageId]?.pageprops?.wikibase_item;
      if (qid) return qid;
    }
  } catch (e) {
    state.stats.errors++;
    console.error(`Error finding QID for ${cleanName}:`, e);
  }
  return null;
}