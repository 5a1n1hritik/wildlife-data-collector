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
    ADAPTIVE_STEP: 5,
  },
  RETRY: {
    MAX_TRIES: 3,
  },
  PERSISTENCE: {
    SAVE_EVERY: 25,
  },
};

// --- 2. STATE TRACKER (Point 2: State management) ---
let state = {
  wikiMap: new Map<number, any>(),
  failedQueue: [] as { key: number; mammal: any; tries: number }[],
  stats: {
    success: 0,
    errors: 0,
    retries: 0,
    attempted: 0,
    skipped: 0,
    rateLimited: 0,
  },
  currentBatchSize: CONFIG.NETWORK.INITIAL_BATCH_SIZE,
  currentConcurrency: CONFIG.NETWORK.INITIAL_CONCURRENCY,
  lastSavedCount: 0,
  isShuttingDown: false,
  failedSet: new Set<number>(),
  attemptedSet: new Set<number>(),
};

let limit = pLimit(state.currentConcurrency);
let batchRateLimited = false;
let GLOBAL_TOTAL = 0;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spin = 0;
let lastAdaptReason: "RATE_LIMIT" | "ERROR" | "STABLE" = "STABLE";
let startTime = Date.now();
import readline from "readline";

let uiLines = 0;
let lastRender = 0;
const UI_THROTTLE_MS = 120;

function loadInput() {
  const dir = path.dirname(CONFIG.FILES.OUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(CONFIG.FILES.TEMP)) {
    fs.unlinkSync(CONFIG.FILES.TEMP);
  }

  if (fs.existsSync(CONFIG.FILES.OUT)) {
    const existing = JSON.parse(fs.readFileSync(CONFIG.FILES.OUT, "utf-8"));
    existing.forEach((m: any) => state.wikiMap.set(m.key, m));
    state.lastSavedCount = state.wikiMap.size;
    console.log(
      `\x1b[90m Resuming from: ${state.wikiMap.size} records\x1b[0m`,
    );
  }

  return JSON.parse(fs.readFileSync(CONFIG.FILES.IN, "utf-8"));
}

// 4. Graceful Shutdown (Ctrl+C Handling)
process.on("SIGINT", () => {
  if (state.isShuttingDown) return;
  try {
    console.log("\n\x1b[31m Shutdown signal received. Saving progress...\x1b[0m");
    state.isShuttingDown = true;
    saveData(true);
  } catch (e) {
    console.error("\x1b[31m Save failed during shutdown\x1b[0m", e);
  }

  setTimeout(() => {
    process.exit(0);
  }, 500);
});

function saveData(force = false) {
  const data = Array.from(state.wikiMap.values());
  const shouldCommit = force || data.length - state.lastSavedCount >= 50;

  if (!shouldCommit) return;

  fs.writeFileSync(CONFIG.FILES.TEMP, JSON.stringify(data, null, 2));
  fs.renameSync(CONFIG.FILES.TEMP, CONFIG.FILES.OUT);

  state.lastSavedCount = data.length;
}

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function renderProgressBar(processed: number, total: number, barWidth = 30) {
  const pct = processed / total;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const bar = `\x1b[35m${"█".repeat(filled)}\x1b[32m${"-".repeat(empty)}\x1b[0m`;
  return `[${bar}] ${(pct * 100).toFixed(2)}%`;
}

function renderUI(processed: number, total: number) {
  const now = Date.now();
  if (now - lastRender < UI_THROTTLE_MS) return;
  lastRender = now;

  const elapsed = Date.now() - startTime;
  const rate = processed / (elapsed / 1000 || 1);
  const remaining = (total - processed) / (rate || 1);

  const trend =
    lastAdaptReason === "RATE_LIMIT"
      ? "\x1b[31m↓ adapting\x1b[0m"
      : lastAdaptReason === "ERROR"
        ? "\x1b[33m⚠ adjusting\x1b[0m"
        : "\x1b[32m↑ stable\x1b[0m";

  const heartbeat = SPINNER[spin++ % SPINNER.length];

  const block = [
    `Speed        : ${rate.toFixed(2)} items/sec`,
    `Elapsed      : ${formatTime(elapsed)}`,
    `ETA          : ${formatTime(remaining * 1000)}`,
    `Progress     : ${processed}/${total} ${renderProgressBar(processed, total)}`,
    ``,
    `Batch Size   : ${state.currentBatchSize} ${trend}`,
    `Concurrency  : ${state.currentConcurrency}`,
    `Heartbeat    : ${heartbeat}`,
    ``,
    `--- Stats ---`,
    `Success      : ${state.stats.success}`,
    `Skipped      : ${state.stats.skipped}`,
    `Errors       : ${state.stats.errors}`,
    `Retries      : ${state.stats.retries}`,
    `429 Hits     : ${state.stats.rateLimited}`,
    `Retry Queue  : ${state.failedQueue.length}`,
  ];

  // Move cursor up exactly previous UI height
  if (uiLines > 0) {
    readline.moveCursor(process.stdout, 0, -uiLines);
  }

  // Clear and rewrite cleanly
  block.forEach((line) => {
    readline.clearLine(process.stdout, 0);
    process.stdout.write(line + "\n");
  });

  uiLines = block.length;
}

function onMammalProcessed(total: number) {
  renderUI(state.stats.attempted, GLOBAL_TOTAL);

  if (
    state.stats.success > 0 &&
    state.stats.success % CONFIG.PERSISTENCE.SAVE_EVERY === 0
  ) {
    saveData();
  }
}

function adjustBatchSize(batchErrors: number, batchRateLimited: boolean) {
  if (batchRateLimited) {
    lastAdaptReason = "RATE_LIMIT";
    state.currentBatchSize = Math.max(
      CONFIG.NETWORK.BATCH_MIN,
      Math.floor(state.currentBatchSize / 2),
    );

    if (state.currentConcurrency > 1) {
      state.currentConcurrency--;
      limit = pLimit(state.currentConcurrency);
    }

    state.stats.rateLimited = 0;
    return;
  }

  if (batchErrors > 0) {
    lastAdaptReason = "ERROR";
    state.currentBatchSize = Math.max(
      CONFIG.NETWORK.BATCH_MIN,
      state.currentBatchSize - CONFIG.NETWORK.ADAPTIVE_STEP,
    );
  } else {
    lastAdaptReason = "STABLE";
    state.currentBatchSize = Math.min(
      CONFIG.NETWORK.BATCH_MAX,
      state.currentBatchSize + CONFIG.NETWORK.ADAPTIVE_STEP,
    );
  }
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
        batchRateLimited = true;
        state.stats.rateLimited++;
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
      state.stats.retries++; // EVERY retry counted

      if (i === retries - 1 && !state.isShuttingDown) {
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

function resolveWikiTarget(mammal: any) {
  if (mammal.rank === "SUBSPECIES" && mammal.parentSpecies) {
    return {
      primary: cleanScientificName(mammal),
      fallback: mammal.parentSpecies,
    };
  }

  return {
    primary: cleanScientificName(mammal),
    fallback: null,
  };
}

async function collectWikipedia(mammal: any) {
  try {
    if (state.wikiMap.has(mammal.key)) {
      state.stats.skipped++;
      onMammalProcessed(GLOBAL_TOTAL);
      return;
    }

    if (!state.attemptedSet.has(mammal.key)) {
      state.attemptedSet.add(mammal.key);
      state.stats.attempted++;
    }

    const { primary, fallback } = resolveWikiTarget(mammal);

    let intro = await fetchIntro(primary);
    let wikitext = await fetchWikitext(primary);
    let wikiSource: "SELF" | "PARENT" = "SELF";

    if ((!intro || !wikitext) && fallback) {
      intro = await fetchIntro(fallback);
      wikitext = await fetchWikitext(fallback);
      wikiSource = "PARENT";
    }

    if (!intro && !wikitext) {
      state.stats.errors++;
      if (!state.failedSet.has(mammal.key)) {
        state.failedSet.add(mammal.key);
        state.failedQueue.push({
          key: mammal.key,
          mammal,
          tries: 1,
        });
      }
      return;
    }

    // transient RAW object
    const raw = {
      intro_raw: intro?.intro_raw ?? null,
      wikitext_raw: wikitext ?? null,
    };

    // directly run extraction
    const processed = runWikipediaSemanticExtractor({
      ...mammal,
      wikipedia_raw: raw,
      _wiki_meta: {
        source: wikiSource,
        inherited_from: wikiSource === "PARENT" ? fallback : null,
      },
    });

    // Remove RAW Data
    delete processed.wikipedia_raw;

    state.wikiMap.set(mammal.key, processed);
    state.stats.success++;
    onMammalProcessed(GLOBAL_TOTAL);
  } catch (err: any) {
    const msg = String(err?.message || "");

    if (msg.includes("429")) state.stats.rateLimited++;

    if (!state.failedSet.has(mammal.key)) {
      state.failedSet.add(mammal.key);
      state.stats.errors++;
      onMammalProcessed(GLOBAL_TOTAL);
      state.failedQueue.push({
        key: mammal.key,
        mammal,
        tries: 1,
      });
    }
    throw err;
  }
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
  const wikiMeta = mammal._wiki_meta ?? {
    source: "SELF",
    inherited_from: null,
  };

  mammal.wikipedia_semantic = {
    source: wikiMeta.source,
    inherited_from: wikiMeta.inherited_from,
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

async function processBatches(data: any[]) {
  let index = 0;

  while (index < data.length && !state.isShuttingDown) {
    batchRateLimited = false;

    const batch = data.slice(index, index + state.currentBatchSize);
    let batchErrors = 0;

    await Promise.all(
      batch.map((m: any) =>
        limit(async () => {
          try {
            await collectWikipedia(m);
          } catch {
            batchErrors++;
          }
        }),
      ),
    );

    adjustBatchSize(batchErrors, batchRateLimited);
    index += batch.length;

    saveData();
    if (CONFIG.NETWORK.WAIT_BETWEEN_BATCHES > 0) {
      await new Promise((r) =>
        setTimeout(r, CONFIG.NETWORK.WAIT_BETWEEN_BATCHES),
      );
    }
  }
}

async function retryFailures() {
  while (state.failedQueue.length > 0) {
    const job = state.failedQueue.shift()!;
    if (job.tries >= CONFIG.RETRY.MAX_TRIES) continue;

    try {
      await limit(async () => {
        await collectWikipedia(job.mammal);
      });

      if (batchRateLimited) {
        adjustBatchSize(1, true);
      }

      await new Promise((r) => setTimeout(r, job.tries * 3000));
    } catch {
      job.tries++;
      state.failedQueue.push(job);
    }
  }
}

async function start() {
  console.log(
    `\n\x1b[1m◈ Mammal Data Pipeline v3.0 Wikipedia Collector\x1b[0m`,
  );

  try {
    const rawData = loadInput(); // array
    console.log(`\x1b[90m Input loaded: ${rawData.length} mammals\x1b[0m\n`);
    GLOBAL_TOTAL = rawData.length;

    await processBatches(rawData);
    await retryFailures();

    saveData(true);
    console.log(
      `\n\n\x1b[32m✔ PIPELINE WIKIDATA + WIKIPEDIA FINISHED SUCCESSFULLY.\x1b[0m\n`,
    );
  } catch (error) {
    console.error("\n Critical Error:", error);
    saveData(true);
  }
}

start().catch((err) => {
  console.error("\n Critical Error occurred!", err);
  saveData(); // Pehle data save karo
  process.exit(1); // Phir exit karo
});
