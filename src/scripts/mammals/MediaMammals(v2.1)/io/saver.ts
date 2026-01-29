import fs from "fs";
import { state } from "../state/state.ts";
import { CONFIG } from "../config/config.ts";

export function saveData(force = false) {
  const data = Array.from(state.enrichedMap.values());
  const shouldCommit = force || data.length - state.lastSavedCount >= 50;

  if (!shouldCommit) return;

  fs.writeFileSync(CONFIG.FILES.TEMP, JSON.stringify(data, null, 2));
  fs.renameSync(CONFIG.FILES.TEMP, CONFIG.FILES.OUT);

  state.lastSavedCount = data.length;
}