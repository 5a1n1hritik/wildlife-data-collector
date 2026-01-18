// test-sample.ts
async function dryRun(scientificName: string) {
  const cleanName = scientificName.split(" ").slice(0, 2).join(" ");
  
  // 1. Check Wikidata Raw Structure
  const wdSearch = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanName)}&language=en&format=json&origin=*`).then(r => r.json());
  
  if (wdSearch.search?.length > 0) {
    const qid = wdSearch.search[0].id;
    const entity = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`).then(r => r.json());
    const claims = entity.entities[qid].claims;

    console.log(`\n--- [${scientificName}] Wikidata Claims ---`);
    console.log(`QID: ${qid}`);
    console.log(`Weight (P2067):`, JSON.stringify(claims.P2067?.[0]?.mainsnak?.datavalue?.value || "MISSING", null, 2));
    console.log(`Images (P18):`, claims.P18?.length || 0, "found");
  }

  // 2. Check Wikipedia Sidebar (Infobox)
  const wp = await fetch(`https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&prop=revisions&rvprop=content&titles=${encodeURIComponent(cleanName)}&redirects=1`).then(r => r.json());
  const page = Object.values(wp.query.pages)[0] as any;
  const content = page.revisions?.[0]?.["*"] || "";

  console.log(`--- Wikipedia Infobox Raw ---`);
  const infoboxMatch = content.match(/\{\{infobox animal[\s\S]*?\}\}/i) || content.match(/\{\{Taxobox[\s\S]*?\}\}/i);
  console.log(infoboxMatch ? infoboxMatch[0].substring(0, 500) + "..." : "No Infobox Found");
}

// Sample mammals to test
const samples = ["Antilocapra americana", "Hydropotes inermis", "Pudu puda"];
samples.forEach(s => dryRun(s));