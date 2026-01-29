import fs from "fs";
import path from "path";
import { CONFIG } from "../config/config.ts";
import { state } from "../state/state.ts";

export function loadData() {
  const dir = path.dirname(CONFIG.FILES.OUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(CONFIG.FILES.TEMP)) {
    fs.unlinkSync(CONFIG.FILES.TEMP);
  }

  if (fs.existsSync(CONFIG.FILES.OUT)) {
    const existing = JSON.parse(fs.readFileSync(CONFIG.FILES.OUT, "utf-8"));
    existing.forEach((m: any) => state.enrichedMap.set(m.key, m));
    state.lastSavedCount = state.enrichedMap.size;
    console.log(
      `\x1b[90mResuming from: ${state.enrichedMap.size} records\x1b[0m\n`,
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG.FILES.IN, "utf-8"));
}