import fs from "fs";
import pLimit from "p-limit";

const API_KEY = "473866643cdf5e40cc7801b313f5cfca4c5d11d3"; 
const INPUT_FILE = "src/data/discovery/birds.raw.json";
const OUTPUT_FILE = "src/data/discovery/birds.enriched.json";
const BATCH_SIZE = 50; // Chota batch rakhte hain safety ke liye

const limit = pLimit(2);
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

let enrichedData: any[] = [];
let isShuttingDown = false; // Flag for graceful shutdown

// File Load logic with JSON validation
if (fs.existsSync(OUTPUT_FILE)) {
  try {
    const content = fs.readFileSync(OUTPUT_FILE, "utf-8").trim();
    enrichedData = content ? JSON.parse(content) : [];
    console.log(`  Resume from: ${enrichedData.length} birds.`);
  } catch (e) {
    console.error(" Output file corrupt. Resetting to [].");
    enrichedData = [];
  }
}

// Helper: Save function
const saveData = () => {
  console.log(`\n Saving ${enrichedData.length} records to file...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedData, null, 2));
};

// Signal Listeners: Ctrl+C handle karne ke liye
process.on('SIGINT', () => {
  console.log("\n Shutdown signal received (Ctrl+C). Saving progress...");
  isShuttingDown = true;
  saveData();
  process.exit();
});

// ... (getBirdAudio and getWikiData remain the same as your previous code)
async function getBirdAudio(scientificName: string) {
    const cleanName = scientificName.split(' ').slice(0, 2).join(' ');
    const url = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(`sp:"${cleanName}"`)}&key=${API_KEY}`;
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.log("\n Rate limit hit! Waiting...");
        await sleep(30000);
        return null;
      }
      const data = await res.json();
      if (data.recordings?.length > 0) {
        const best = data.recordings.find((r: any) => r.q === 'A') || data.recordings[0];
        return best.file.startsWith('//') ? `https:${best.file}` : best.file;
      }
    } catch { return null; }
    return null;
}

async function getWikiData(scientificName: string) {
    const cleanName = scientificName.split(' ').slice(0, 2).join(' ');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'WildlifeExplorer/1.0' } });
      if (!res.ok) return null;
      const data = await res.json();
      return { bio: data.extract, image: data.originalimage?.source || data.thumbnail?.source, wikiUrl: data.content_urls?.desktop?.page };
    } catch { return null; }
}

async function startEnrichment() {
  const allBirds = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const remainingBirds = allBirds.slice(enrichedData.length);

  console.log(` Remaining birds to process: ${remainingBirds.length}`);

  for (let i = 0; i < remainingBirds.length; i++) {
    // Agar Ctrl+C press hua hai toh loop se bahar aa jao
    if (isShuttingDown) break;

    const bird = remainingBirds[i];
    
    try {
        const result = await limit(async () => {
          process.stdout.write(`\r[${enrichedData.length + 1}/${allBirds.length}] Processing: ${bird.canonicalName}... `);
          
          const [wiki, audio] = await Promise.all([
            getWikiData(bird.scientificName),
            getBirdAudio(bird.scientificName)
          ]);

          const bio = wiki?.bio?.toLowerCase() || "";
          const habitat = bio.includes("forest") ? "Forest" : bio.includes("water") ? "Wetland" : "Terrestrial";
          const diet = bio.includes("insect") ? "Insectivore" : bio.includes("fruit") ? "Herbivore" : "Omnivore";

          return {
            ...bird,
            description: wiki?.bio || "Information coming soon.",
            media: { 
                image: wiki?.image || "/placeholder.jpg", 
                audio: audio || null, // null rehne do agar nahi hai
                wikiUrl: wiki?.wikiUrl || null 
            },
            traits: { habitat, diet }
          };
        });

        enrichedData.push(result);
        
        // Har BATCH_SIZE birds ke baad save karein
        if (enrichedData.length % BATCH_SIZE === 0) {
          saveData();
        }

        await sleep(200); 
    } catch (err) {
        console.error(`\n Error processing ${bird.canonicalName}. Saving and continuing...`);
        saveData();
    }
  }

  saveData();
  console.log("\n Done! Check your enriched.json file.");
}

startEnrichment().catch((err) => {
  console.error("\n Critical Error occurred!");
  console.error(err);
  saveData(); // Pehle data save karo
  process.exit(1); // Phir exit karo
});