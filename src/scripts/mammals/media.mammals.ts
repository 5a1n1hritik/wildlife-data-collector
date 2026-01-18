import fs from "fs";
import path from "path";
import pLimit from "p-limit";

// --- Configuration ---
const IN_FILE = "src/data/discovery/mammals/mammals.raw.json";
const OUT_FILE = "src/data/discovery/mammals/mammals.enriched.json";
const TEMP_FILE = `${OUT_FILE}.tmp`;
const CONCURRENCY = 5;

const limit = pLimit(CONCURRENCY);
let enrichedMap = new Map<number, any>();
let lastSaveCount = 0;

// Helper: Fetch with Retry and Headers
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "MammalEnrichmentBot/1.0 (contact: your@email.com)",
        },
      });

      if (res.status === 429) {
        // Too Many Requests
        const wait = (i + 1) * 2000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const contentType = res.headers.get("content-type");
      if (
        !res.ok ||
        !contentType ||
        !contentType.includes("application/json")
      ) {
        throw new Error(`Invalid response status: ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Load Existing Progress
function loadData() {
  const dir = path.dirname(OUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(OUT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(OUT_FILE, "utf-8"));
    existing.forEach((m: any) => enrichedMap.set(m.key, m));
    lastSaveCount = enrichedMap.size;
    console.log(`Resuming: ${enrichedMap.size} already enriched.`);
  }
  return JSON.parse(fs.readFileSync(IN_FILE, "utf-8"));
}

// Save Logic
const saveData = (force = false) => {
  const dataArray = Array.from(enrichedMap.values());
  fs.writeFileSync(TEMP_FILE, JSON.stringify(dataArray, null, 2));

  const newRecords = enrichedMap.size - lastSaveCount;
  if (force || newRecords >= 100) {
    fs.renameSync(TEMP_FILE, OUT_FILE);
    lastSaveCount = enrichedMap.size;
    console.log(`\n Checkpoint: ${enrichedMap.size} mammals synced.`);
  }
};

// --- NEW HELPER: Wikipedia Table to Markdown ---
function convertWikiTableToMarkdown(wikiText: string): string {
  const rows = wikiText.split(/\|-/);
  let mdTable = "\n| Property | Value |\n| :--- | :--- |\n";
  let hasData = false;

  rows.forEach((row) => {
    // Basic extraction of key-value pairs from table cells
    const cells = row
      .split(/\||!!/)
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith("{|") && !c.endsWith("|}"));
    if (cells.length >= 2) {
      const key = cells[0].replace(/'''/g, "").replace(/\[\[|\]\]/g, "");
      const value = cells[1].replace(/'''/g, "").replace(/\[\[|\]\]/g, "");
      if (key.length < 50 && value.length < 200) {
        // Filter out non-data rows
        mdTable += `| ${key} | ${value} |\n`;
        hasData = true;
      }
    }
  });
  return hasData ? mdTable : "";
}

// --- NEW HELPER: Extract Images from Gallery ---
function extractGalleryImages(text: string): string[] {
  const galleryRegex = /<gallery[\s\S]*?>([\s\S]*?)<\/gallery>/gi;
  const match = galleryRegex.exec(text);
  if (!match) return [];

  const lines = match[1].split("\n");
  return lines
    .map((line) => {
      const m = line.match(/(?:File:|Image:)([^|\]\n]+)/i);
      return m
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(m[1].trim())}?width=1000`
        : null;
    })
    .filter((url): url is string => !!url);
}

// Helper Function: Weight cleanup and conversion
function cleanAndConvertWeight(raw: string): string {
  if (!raw || /unknown/i.test(raw)) return "Unknown";

  let clean = raw.replace(/[–—−]/g, "-").replace(/&nbsp;/g, " ").trim();

  const weightRegex = /(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:kg|g|lb|pound|kilogram)s?)/i;
  const match = clean.match(weightRegex);

  if (match) {
    let result = match[0].toLowerCase().replace(/[\[\]{}]/g, "");

    // Convert LB to KG if necessary
    if (result.includes("lb") || result.includes("pound")) {
      const nums = result.match(/\d+(?:\.\d+)?/g);
      if (nums) {
        const kgs = nums.map(n => (parseFloat(n) * 0.453592).toFixed(1));
        return kgs.length > 1 ? `${kgs[0]}–${kgs[1]} kg` : `${kgs[0]} kg`;
      }
    }

    // 2. Grams to KG conversion (for newborns)
    if (result.match(/\d+\s*g$/)) {
      const num = parseFloat(result);
      if (!isNaN(num)) return `${(num / 1000).toFixed(2)} kg`;
    }

    return result;
  }
  return "Unknown";
}

// Removes Wiki markup (Galleries, Tables, Templates, References) for a clean UI description
function finalCleanDescription(text: string): string {
  if (!text) return "";
  
  let clean = text
    .replace(/\{\{(?:[^{}]+|\{\{[^{}]*\}\})*\}\}/g, (match) => {
      const p = match.replace(/[{}]/g, "").split("|");
      const cmd = p[0].trim().toLowerCase();
      if (cmd === "cvt" || cmd === "convert") {
        if (p[2] === "to" || p[2] === "-") return `${p[1]}–${p[3]} ${p[4]}`;
        return `${p[1]} ${p[2]}`;
      }
      return "";
    })
    .replace(new RegExp("", "g"), "")
    // 2. Clear Tables and Special Wiki blocks
    .replace(/\{\|[\s\S]*?\|\}/g, "") // Full Wiki tables saaf
    .replace(/![\s\S]*?(?=\n|\|)/g, "") // Table headers
    .replace(/class=["'][^"']*["']/g, "") // CSS classes
    // 3. Media, Refs and HTML
    .replace(/class=["'][^"']*["']/g, "")
    .replace(/<ref.*?>.*?<\/ref>|<ref.*?\/>|<[^>]*>/gs, "")
    .replace(/\[\[(?:File|Image|Category):.*?(?=\||\n|\]\]).*?\]\]/gi, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    // 4. Final Stray symbols
    .replace(/[\[\]{}|=]/g, "") 
    .replace(/\s+/g, " ")

    .replace(/<gallery[\s\S]*?<\/gallery>/gi, "") // Galleries hatao
    .replace(/<[^>]*>/g, "") // Baaki saare HTML tags
    .replace(/'''+/g, "**")
    .replace(/''+/g, "_")
    .replace(/&nbsp;/g, " ")
    .trim();

  return clean;
}

// Scans text for traits if structured data is missing
function mineTraitsFromText(fullText: string, intro: string, current: any) {
  const traits = { ...current };
  const combined = (fullText + " " + intro).replace(/[–—−]/g, "-")
    .replace(/\d+\s*(?:cm|in|inch|ft|foot|m|mm)\b/gi, "");

  if (traits.adult_weight === "Unknown" || traits.adult_weight.includes("0")) {
    const malePattern = /males?\s+(?:weigh|weight|mass)[^.]{0,60}?(\d+(?:\s*-\s*\d+)?\s*(?:kg|lb|pound)s?)/i;
    const femalePattern = /females?\s+(?:weigh|weight|mass)[^.]{0,60}?(\d+(?:\s*-\s*\d+)?\s*(?:kg|lb|pound)s?)/i;

    const m = combined.match(malePattern);
    const f = combined.match(femalePattern);

    if (m && f) {
      traits.adult_weight = `Male: ${cleanAndConvertWeight(m[1])}, Female: ${cleanAndConvertWeight(f[1])}`;
    } else {
      const general = combined.match(/(?:weight|mass|weighing)\s*(?:is|of|around)?\s*(\d+(?:\s*-\s*\d+)?\s*(?:kg|lb|kilogram)s?)/i);
      if (general) traits.adult_weight = cleanAndConvertWeight(general[1]);
    }
  }

  // 2. NEWBORN WEIGHT (New Logic)
  if (traits.newborn_weight === "Unknown") {
    const newbornPat = /(?:newborn|birth|young|fawns?)\s+(?:weigh|weight)[^.]{0,40}?(\d+(?:\s*-\s*\d+)?\s*(?:kg|g|lb)s?)/i;
    const nbMatch = combined.match(newbornPat);
    if (nbMatch) traits.newborn_weight = cleanAndConvertWeight(nbMatch[1]);
  }
  
  // Lifespan: Range handle karein (e.g., "10-12 years")
  const lMatch = combined.match(/(?:lifespan|lives?|longevity)[^.]{0,50}(\d+(?:\s*-\s*\d+)?\s*years)/i);
  if (lMatch && (traits.lifespan === "Unknown" || traits.lifespan.startsWith("0"))) {
    traits.lifespan = lMatch[1].toLowerCase();
  }

  return traits;
}

// HELPER: Clean Wikitext & Extract Sections
function parseGoldmineSections(
  fullText: string,
  currentImages: string[]
): { text: string; images: string[] } {
  if (!fullText) return { text: "", images: currentImages };

  // 2. find importent sections
  const sections = [
    { name: "Habitat", title: "Habitat" },
    { name: "Habitat|Distribution", title: "Habitat & Distribution" },
    { name: "Description|Morphology", title: "Physical Attributes" },
    { name: "Behavior|Behaviour", title: "Behavior" },
    { name: "Reproduction|Breeding", title: "Reproduction" },
  ];

  let extraInfo = "";
  let newImages = [...currentImages];

  sections.forEach((sec) => {
    const regex = new RegExp(
      `==\\s*(?:${sec.name})\\s*==\\s*([\\s\\S]*?)(?===\\s|\\n\\n|$)`,
      "i"
    );
    const match = fullText.match(regex);
    if (match && match[1]) {
      const sectionRaw = match[1];

      // 1. Extract Gallery Images if present in section
      const galleryImgs = extractGalleryImages(sectionRaw);
      newImages.push(...galleryImgs);

      // 2. Extract Table and convert to Markdown if present
      const tableMatch = sectionRaw.match(/\{\|[\s\S]*?\|\}/g);
      let tableMd = "";
      if (tableMatch) {
        tableMd = convertWikiTableToMarkdown(tableMatch[0]);
      }

      const cleaned = finalCleanDescription(sectionRaw);
    //   const cleaned = finalCleanDescription(sectionRaw).substring(0, 800);

      if (cleaned.length > 50) {
        extraInfo += `\n\n### ${sec.title}\n${cleaned}${tableMd}`;
      }
    }
  });

  return { text: extraInfo, images: Array.from(new Set(newImages)) };
}

// HELPER: Image Caption Discovery
function findGenderImages(
  fullText: string,
  images: string[]
): { male: string | null; female: string | null } {
  let male: string | null = null;
  let female: string | null = null;

  // Wikitext mein image captions scan karna
  // Format: [[File:Name.jpg|thumb|Caption text]]
  const imageBlocks = fullText.match(/\[\[File:[^\]]+\]\]/gi) || [];

  imageBlocks.forEach((block) => {
    const lowerBlock = block.toLowerCase();
    const fileNameMatch = block.match(/File:([^|\]]+)/i);
    if (!fileNameMatch) return;

    const fileName = fileNameMatch[1].trim().replace(/ /g, "_");
    // Original images array mein se matching URL dhoondna
    const fullUrl = images.find((img) =>
      img.includes(encodeURIComponent(fileName))
    );

    if (fullUrl) {
      if (
        !male &&
        (lowerBlock.includes("male") ||
          lowerBlock.includes("stag") ||
          lowerBlock.includes("bull"))
      ) {
        male = fullUrl;
      }
      if (
        !female &&
        (lowerBlock.includes("female") ||
          lowerBlock.includes("doe") ||
          lowerBlock.includes("cow"))
      ) {
        female = fullUrl;
      }
    }
  });

  return { male, female };
}

// Main Logic: Hybrid Data Fetcher
async function fetchHybridData(scientificName: string) {
  try {
    // only first two words (Genus + Species)
    const cleanName = scientificName.split(" ").slice(0, 2).join(" ");

    let result: any = {
      conservationStatus: "Unknown",
      traits: {
        adult_weight: "Unknown",
        newborn_weight: "Unknown",
        lifespan: "Unknown",
      },
      media: { images: [] as string[], maleImage: null, femaleImage: null },
      description: "",
      wikiUrl: null,
      imageUrl: null, // Fallback image
      lastSync: new Date().toISOString(),
    };

    // Wikidata (Search API)
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=en&format=json&origin=*`;

    const searchData = await fetchWithRetry(searchUrl);

    if (searchData.search && searchData.search.length > 0) {
      const qid = searchData.search[0].id;

      // Get Structured Claims using QID
      const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|sitelinks&format=json&origin=*`;
      const entityData = await fetchWithRetry(entityUrl);
      const claims = entityData.entities[qid].claims;

      // IUCN Status (P141)
      if (claims.P141) {
        const sId = claims.P141[0].mainsnak.datavalue.value.id;
        const statusMap: any = {
          Q211005: "LC",
          Q719675: "NT",
          Q278113: "VU",
          Q11394: "EN",
          Q239509: "CR",
          Q3245245: "DD",
        };
        result.conservationStatus = statusMap[sId] || "Unknown";
      }

      // Weight (P2067)
      if (claims.P2067) {
        const amt = Math.abs(
          parseFloat(claims.P2067[0].mainsnak.datavalue.value.amount)
        );

        if (amt < 8) result.traits.newborn_weight = `${amt.toFixed(2)} kg`;
        else result.traits.adult_weight = `${amt.toFixed(2)} kg`;
      }

      // Lifespan (P2257)
      if (claims.P2257) {
        const val = claims.P2257[0].mainsnak.datavalue.amount;
        result.traits.lifespan = `${Math.round(parseFloat(val) / 365)} years`;
      }

      // All Images & Genders (P18)
      if (claims.P18) {
        claims.P18.forEach((img: any) => {
          const imgName = img.mainsnak.datavalue.value;
          const imgUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imgName)}?width=1000`;

          result.media.images.push(imgUrl);
          if (!result.imageUrl) result.imageUrl = imgUrl;

          // Wikidata Qualifiers
          const genderId =
            img.qualifiers?.P21?.[0]?.mainsnak?.datavalue?.value?.id;
          if (genderId === "Q44148") result.media.maleImage = imgUrl;
          else if (genderId === "Q43445") result.media.femaleImage = imgUrl;
          else {
            // Priority Filename Check
            const lowerName = imgName.toLowerCase();
            if (
              !result.media.maleImage &&
              lowerName.includes("male") &&
              !lowerName.includes("female")
            )
              result.media.maleImage = imgUrl;
            if (!result.media.femaleImage && lowerName.includes("female"))
              result.media.femaleImage = imgUrl;
          }
        });
      }
    }

    // Wikipedia (Deep Fetch for Media)
    const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions|extracts|pageimages&rvprop=content&exintro=1&explaintext=1&titles=${encodeURIComponent(cleanName)}&pithumbsize=1000&format=json&origin=*&redirects=1`;
    const wpData = await fetchWithRetry(wpUrl);

    const pages = wpData.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (page && pageId !== "-1") {
      result.wikiUrl = `https://en.wikipedia.org/?curid=${page.pageid}`;
      if (!result.imageUrl) result.imageUrl = page.thumbnail?.source || null;

      // Raw Wikitext for Infobox
      const fullText = page.revisions?.[0]?.["*"] || "";
      const rawIntro = page.extract || "";

      // Wikipedia text mining for missing Adult Weight
      //   if (result.traits.adult_weight === "Unknown") {
      //     const infoboxWeight = fullText.match(
      //       /\|\s*(?:weight|mass)\s*=\s*([^|\n}]+)/i
      //     );
      //     if (infoboxWeight)
      //       result.traits.adult_weight = cleanAndConvertWeight(infoboxWeight[1]);

      //     const mMatch = fullText.match(
      //       /males?\s+(?:weigh|weight|mass)[^.]{0,50}(\d+(?:[–-]\d+)?\s*(?:kg|kilogram|lb|pound)s?)/i
      //     );

      //     const fMatch = fullText.match(
      //       /females?\s+(?:weigh|weight|mass)[^.]{0,50}(\d+(?:[–-]\d+)?\s*(?:kg|kilogram|lb|pound)s?)/i
      //     );

      //     if (mMatch && fMatch) {
      //       result.traits.adult_weight = `Male: ${mMatch[1]}, Female: ${fMatch[1]}`;
      //     } else {
      //       // 2. Standard Weight Pattern
      //       const wMatch =
      //         fullText.match(
      //           /(?:adult|total|body)\s*(?:weight|mass)[^.]{0,30}(\d+(?:[–-]\d+)?\s*(?:kg|lb|gram|g)\b)/i
      //         ) ||
      //         fullText.match(
      //           /weigh(?:s|t|ing)?[^.]{0,30}(\d+(?:[–-]\d+)?\s*(?:kg|lb|gram|g)\b)/i
      //         );
      //       if (wMatch) result.traits.adult_weight = wMatch[1];
      //     }
      //   }

      // Priority 3: Text Mining/Regex (If Priority 1 & 2 failed)
      //   if (result.traits.adult_weight === "Unknown") {
      //     const textWeight = page.extract.match(
      //       /(?:weigh(?:s|t|ing)?|mass|weight)(?:\s+(?:of|is|around|about|up to))?\s*(\d+(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?\s*(?:kg|kilogram|lb|pound|g|gram)s?)/i
      //     );
      //     if (textWeight) {
      //       result.traits.adult_weight = cleanAndConvertWeight(textWeight[1]);
      //     }
      //   }

      // GOLDMINE DESCRIPTION (Clean & Structured)
      const deepData = parseGoldmineSections(fullText, result.media.images); // Habitat, Behavior etc.

      const intro = finalCleanDescription(rawIntro);
    //   const intro = finalCleanDescription(rawIntro).substring(0, 500);

      result.description = `## Introduction\n${intro}\n ${deepData.text.trim()}`;

      result.media.images = deepData.images;
      result.traits = mineTraitsFromText(
        fullText, rawIntro,
        result.traits
      );

      // SMART GENDER IMAGES (From Captions)
      const genderImages = findGenderImages(fullText, result.media.images);
      if (!result.media.maleImage) result.media.maleImage = genderImages.male;
      if (!result.media.femaleImage)
        result.media.femaleImage = genderImages.female;

      // --- AGGRESSIVE LIFESPAN EXTRACTION ---
      //   if (result.traits.lifespan === "Unknown") {
      //     const lMatch = fullText.match(
      //       /(?:lifespan|life expectancy|longevity|live)[^.]{0,50}(\d+(?:[–-]\d+)?\s*years)/i
      //     );
      //     if (lMatch) result.traits.lifespan = lMatch[1];
      //   }

      // --- NEWBORN WEIGHT ---
      //   if (result.traits.newborn_weight === "Unknown") {
      //     const nbMatch = fullText.match(
      //       /(?:birth weight|newborns? weigh|young weigh)[^.]{0,30}(\d+(?:\.\d+)?\s*(?:kg|g|gram)s?)/i
      //     );
      //     if (nbMatch) result.traits.newborn_weight = nbMatch[1];
      //   }
    }

    result.traits.adult_weight = result.traits.adult_weight
      .replace(/[{}[\]]/g, "")
      .trim();

    return result;
  } catch (e) {
    console.error(`Error fetching ${scientificName}:`, e);
    return null;
  }
}

// 4. Main Execution
async function startEnrichment() {
  const rawData = loadData();
  console.log(`Starting Enrichment for ${rawData.length} mammals...`);

  const tasks = rawData.map((mammal: any) =>
    limit(async () => {
      if (enrichedMap.has(mammal.key)) return;

      const wiki = await fetchHybridData(mammal.scientificName);
      if (wiki) {
        enrichedMap.set(mammal.key, { ...mammal, ...wiki });
      } else {
        // Wiki not persent use default status
        enrichedMap.set(mammal.key, {
          ...mammal,
          wikiUrl: null,
          traits: {
            adult_weight: "Unknown",
            newborn_weight: "Unknown",
            lifespan: "Unknown",
          },
          conservationStatus: "NE",
          lastSync: new Date().toISOString(),
        });
      }

      saveData();
      process.stdout.write(
        `\rProgress: ${enrichedMap.size}/${rawData.length} | Status: ${wiki?.conservationStatus || "NE"}`
      );
    })
  );

  await Promise.all(tasks);
  saveData(true); // Final force save
  console.log("\n Phase 2 Mammals Enrichment Completed Successfully!");
}

startEnrichment().catch(console.error);
