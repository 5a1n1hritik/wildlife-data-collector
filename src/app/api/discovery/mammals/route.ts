import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fetchMammalSpecies } from "@/lib/adapters/wikidata.sparql";
import { normalizeDiscoveryResults } from "@/lib/cleaners/discovery.cleaner";

export async function POST() {
  const raw = await fetchMammalSpecies();
  const normalized = normalizeDiscoveryResults(raw);

  const outDir = path.join(
    process.cwd(),
    "src/data/discovery"
  );

  await mkdir(outDir, { recursive: true });

  const outPath = path.join(
    outDir,
    "mammals.raw.json"
  );

  await writeFile(
    outPath,
    JSON.stringify(normalized, null, 2)
  );

  return Response.json({
    count: normalized.length,
    success: true
  });
}
