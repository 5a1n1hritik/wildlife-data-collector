import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { fetchIntro } from "./fetchIntro.ts";
import { fetchWikitext } from "./fetchWikitext.ts";
import {
  buildSectionTree,
  cleanTextForMarkdown,
  convertWikiTextToMarkdown,
  extractGalleryImages,
  extractImages,
  extractMapFromInfobox,
  extractTables,
  findGenderImages,
  findMapImage,
  normalizeWhitespace,
  splitSections,
  stripTables,
} from "./Semantic.Extractor.helpers.ts";

// --- Configuration ---
const CONFIG = {
  FILES: {
    IN: "src/data/discovery/mammals/mammals.enriched.json",
    OUT: "src/data/discovery/mammals/mammals.final.json",
    TEMP: "src/data/discovery/mammals/mammals.final.json.tmp",
  },
  NETWORK: {
    INITIAL_CONCURRENCY: 3,
    BATCH_MIN: 10,
    BATCH_MAX: 60,
    INITIAL_BATCH_SIZE: 50,
    TIMEOUT_MS: 20000,
    WAIT_BETWEEN_BATCHES: 1200,
  },
};

// --- 2. STATE TRACKER (Point 2: State management) ---
let state = {
  wikiMap: new Map<number, any>(),
  //   failedQueue: [] as any[],
  stats: { success: 0, errors: 0, retries: 0 },
  currentBatchSize: CONFIG.NETWORK.INITIAL_BATCH_SIZE,
  lastSavedCount: 0,
};

const limit = pLimit(CONFIG.NETWORK.INITIAL_CONCURRENCY);

function loadInput() {
  return JSON.parse(fs.readFileSync(CONFIG.FILES.IN, "utf-8"));
}

function loadExisting() {
  if (!fs.existsSync(CONFIG.FILES.OUT)) return;
  const existing = JSON.parse(fs.readFileSync(CONFIG.FILES.OUT, "utf-8"));
  existing.forEach((m: any) => state.wikiMap.set(m.key, m));
}

function save() {
  const data = Array.from(state.wikiMap.values());
  fs.writeFileSync(CONFIG.FILES.TEMP, JSON.stringify(data, null, 2));
  fs.renameSync(CONFIG.FILES.TEMP, CONFIG.FILES.OUT);
}

async function fetchWithTimeout(
  url: string,
  timeout = CONFIG.NETWORK.TIMEOUT_MS,
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WildlifeDataCollector/3.0",
      },
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export async function secureFetch(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.status === 429) {
        const wait = (i + 1) * 3000;
        state.stats.retries++;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Non-JSON response");
      }
      return await res.json();
    } catch (e) {
      if (i === retries - 1) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw new Error("secureFetch exhausted retries without response");
}

function cleanScientificName(item: any): string {
  if (!item || !item.scientificName) return "";
  // 1. Pehle brackets aur extra metadata hatao
  let baseName = item.scientificName
    .replace(/\(.*\)/g, "") // Remove (Linnaeus, 1758)
    .replace(/[^a-zA-Z\s-]/g, "") // Remove numbers or symbols
    .trim();

  const words = baseName.split(/\s+/);

  // 2. Rank ke hisaab se words decide karo
  if (item.rank === "SUBSPECIES" && words.length >= 3) {
    return words.slice(0, 3).join(" "); // Trinomial: Moschus moschiferus arcticus
  }

  return words.slice(0, 2).join(" "); // Binomial: Moschus moschiferus
}

async function collectWikipedia(mammal: any) {
  if (state.wikiMap.has(mammal.key)) return;

  const cleanName = cleanScientificName(mammal);
  if (!cleanName) return null;

  const intro = await fetchIntro(cleanName);
  const wikitext = await fetchWikitext(cleanName);

  if (!wikitext && !intro?.intro_raw) return;

  // transient RAW object
  const raw = {
    intro_raw: intro?.intro_raw ?? null,
    wikitext_raw: wikitext ?? null,
  };

  // directly run extraction
  const processed = runWikipediaSemanticExtractor({
    ...mammal,
    wikipedia_raw: raw,
  });

  // Remove RAW Data
  delete processed.wikipedia_raw;

  state.wikiMap.set(mammal.key, processed);
}

// NOTE:
// Expects wikipedia_raw only as transient input.
// Caller MUST delete wikipedia_raw after extraction.
export function runWikipediaSemanticExtractor(mammal: any) {
  const raw = mammal.wikipedia_raw;
  if (!raw?.wikitext_raw) return mammal;

  const sectionsRaw = splitSections(raw.wikitext_raw);

  const sections = sectionsRaw.map((s, idx) => {
    const inlineImages = extractImages(s.raw);
    const galleryImages = extractGalleryImages(s.raw);
    const images = Array.from(new Set([...inlineImages, ...galleryImages]));
    const tables = extractTables(s.raw);
    let text = stripTables(s.raw);
    const markdown = convertWikiTextToMarkdown(text);

    return {
      id: idx + 1,
      title: s.title,
      level: s.level,
      markdown,
      images,
      tables_md: tables,
    };
  });

  const sectionsTree = buildSectionTree(sections);
  const allImages = Array.from(new Set(sections.flatMap((s) => s.images)));
  const genderImages = findGenderImages(sectionsTree);
  const infoboxRaw =
    raw.wikitext_raw.match(/\{\{Speciesbox[\s\S]*?\}\}/)?.[0] ?? null;

  const mapFromInfobox = extractMapFromInfobox(infoboxRaw);
  const mapImage = mapFromInfobox ?? findMapImage(allImages);

  mammal.wikipedia_semantic = {
    summary_md: normalizeWhitespace(cleanTextForMarkdown(raw.intro_raw || "")),
    sections: sectionsTree,
    infobox_raw:
      raw.wikitext_raw.match(/\{\{Speciesbox[\s\S]*?\}\}/)?.[0] ?? null,
    media: {
      images: allImages,
      gender_images: {
        male: genderImages.male,
        female: genderImages.female,
      },
      map_image: mapImage,
    },
  };

  return mammal;
}

async function start() {
  console.log("\n◈ Wikipedia W1 RAW Collector (obedient version)");

  loadExisting();
  const mammals = loadInput();

  for (const m of mammals) {
    await limit(() => collectWikipedia(m));
    if (state.wikiMap.size % 25 === 0) save();
  }

  save();
  console.log("✔ Wikipedia RAW collection finished.");
}

start().catch(console.error);
