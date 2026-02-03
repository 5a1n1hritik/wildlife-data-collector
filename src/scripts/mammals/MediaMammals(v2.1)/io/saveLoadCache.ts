// saveCache.ts
import fs from "fs";
import { CONFIG } from "../config/config.ts";
import { qidCache } from "../state/qidCache.ts";

export function saveCache() {
  fs.writeFileSync(CONFIG.FILES.QID_CACHE, JSON.stringify(Object.fromEntries(qidCache), null, 2));
}

export function loadCache() {
  if (fs.existsSync(CONFIG.FILES.QID_CACHE)) {
    const data = JSON.parse(fs.readFileSync(CONFIG.FILES.QID_CACHE, "utf-8"));
    Object.entries(data).forEach(([k, v]) => qidCache.set(k, v as string));
  }
}
