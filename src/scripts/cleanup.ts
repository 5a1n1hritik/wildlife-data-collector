import fs from "fs";
import path from "path";

const BIRD_FILE = "src/data/discovery/birds.raw.json";

function cleanupBirds() {
    if (!fs.existsSync(BIRD_FILE)) {
        console.log("File nahi mili! Path check karein.");
        return;
    }

    console.log("Birds Cleanup shuru ho raha hai...");
    const rawData = JSON.parse(fs.readFileSync(BIRD_FILE, "utf-8"));
    const initialCount = rawData.length;

    // Map ka use karke duplicates ko remove karna (Key ke basis par)
    const cleanMap = new Map();
    rawData.forEach((item: any) => {
        cleanMap.set(item.key, item);
    });

    const cleanData = Array.from(cleanMap.values());
    const finalCount = cleanData.length;

    // Safe rehne ke liye purani file ka backup
    fs.writeFileSync(`${BIRD_FILE}.bak`, JSON.stringify(rawData, null, 2));
    
    // Naya cleaned data save karein
    fs.writeFileSync(BIRD_FILE, JSON.stringify(cleanData, null, 2));

    console.log(`Cleanup Complete!`);
    console.log(`Pehle the: ${initialCount}`);
    console.log(`Ab hain: ${finalCount}`);
    console.log(`Hataiye gaye: ${initialCount - finalCount}`);
    console.log(`Backup safe hai: ${BIRD_FILE}.bak file par.`);
}

cleanupBirds();