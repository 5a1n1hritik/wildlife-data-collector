import { writeErrorLog } from "../error/errorLogs.ts";
import { secureFetch } from "../network/fetcher.ts";
import { getCachedQID, setCachedQID } from "../state/qidCache.ts";
import { state } from "../state/state.ts";
import { logToUI } from "../ui/progress.ts";

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
  const attempts: { name: string; source: string }[] = [];
  let networkAttempts = 0;
  const MAX_NETWORK_ATTEMPTS = 2;

  // 1️⃣ Scientific name (cleaned)
  const cleanSci = cleanScientificName(item);
  if (cleanSci) attempts.push({ name: cleanSci, source: "scientific" });

  // 2️⃣ Canonical / common name
  if (item.canonicalName && item.canonicalName !== cleanSci) {
    attempts.push({ name: item.canonicalName, source: "canonical" });
  }

  // 3️⃣ Subspecies → species fallback
  if (item.rank === "SUBSPECIES" && cleanSci) {
    const parts = cleanSci.split(" ");
    if (parts.length >= 2) {
      attempts.push({
        name: parts.slice(0, 2).join(" "),
        source: "species-fallback",
      });
    }
  }

  // const cleanName = cleanScientificName(item);
  // if (!cleanName) return null;

  for (const attempt of attempts) {
    if (networkAttempts >= MAX_NETWORK_ATTEMPTS) return null;

    // MICRO-DELAY
    await new Promise((r) => setTimeout(r, 200));

    const cached = getCachedQID(attempt.name);
    if (cached !== undefined) {
      if (cached) (item as any)._qidSource = attempt.source + ":cache";
      return cached;
    }

    try {
      // Wikidata search
      const wdUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(attempt.name)}&language=en&format=json&origin=*`;

      networkAttempts++;
      const res = await secureFetch(wdUrl);
      // let qid: string | null = null;

      // if (res.search && res.search.length > 0) {
      if (res.search.length > 0) {
        const foundQid = res.search[0].id;
        setCachedQID(attempt.name, foundQid);
        // (item as any)._qidSource = "direct";
        (item as any)._qidSource = attempt.source;
        return foundQid;
      } else {
        // const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(cleanName)}&format=json&origin=*&redirects=1`;
        // const wikiRes = await secureFetch(wikiUrl);
        // const pages = wikiRes.query?.pages;
        // if (pages) {
        //   const pageId = Object.keys(pages)[0];
        //   qid = pages[pageId]?.pageprops?.wikibase_item ?? null;
        // }
      }

      // Wikipedia pageprops fallback
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(
        attempt.name,
      )}&format=json&origin=*&redirects=1`;

      const wikiRes = await secureFetch(wikiUrl);
      const pages = wikiRes.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        const foundQid = pages[pageId]?.pageprops?.wikibase_item ?? null;
        if (foundQid) {
          setCachedQID(attempt.name, foundQid);
          (item as any)._qidSource = attempt.source + ":wiki";
          return foundQid;
        }
      }

      // SUBSPECIES fallback → species binomial
      // if (!qid && item.rank === "SUBSPECIES") {
      //   const parts = cleanName.split(" ");
      //   if (parts.length >= 2) {
      //     const speciesName = parts.slice(0, 2).join(" ");

      //     const cachedSpecies = getCachedQID(speciesName);
      //     if (cachedSpecies !== undefined) {
      //       qid = cachedSpecies;
      //     } else {
      //       const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      //         speciesName,
      //       )}&language=en&format=json&origin=*`;

      //       const res2 = await secureFetch(url);
      //       if (res2.search && res2.search.length > 0) {
      //         qid = res2.search[0].id;
      //         setCachedQID(speciesName, qid);
      //         (item as any)._qidSource = "species-fallback";
      //       } else {
      //         setCachedQID(speciesName, null);
      //       }
      //     }
      //   }
      // }

      // if (qid) {
      //   setCachedQID(cleanName, qid); // cache it
      // } else {
      //   setCachedQID(cleanName, null); // negative cache
      // }

      // return qid;
      setCachedQID(attempt.name, null);
    } catch (e: any) {
      writeErrorLog({
        stage: "QID",
        canonicalName: item.conaonicalName,
        message: e.message || String(e),
        extra: {
          attempt: attempt.name,
          source: attempt.source,
        },
      });
      logToUI(
        `QID error for ${item.canonicalName} (${attempt.source}) Error: ${e.message || e}`,
      );
    }
  }

  writeErrorLog({
    stage: "QID",
    canonicalName: item.canonicalName,
    message: "NO_QID_FOUND_AFTER_ALL_ATTEMPTS",
  });

  return null;
}
