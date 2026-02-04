import fetch from "node-fetch";
import { CONFIG } from "../config/config.ts";
import { state } from "../state/state.ts";
import { logToUI } from "../ui/progress.ts";

let lastRequestTime = 0;
const MIN_REQUEST_GAP = 1200; // 1.2 seconds safety gap

async function rateGate() {
  const now = Date.now();
  const diff = now - lastRequestTime;
  if (diff < MIN_REQUEST_GAP) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP - diff));
  }
  lastRequestTime = Date.now();
}

export async function fetchWithTimeout(
  url: string,
  timeout = CONFIG.NETWORK.TIMEOUT_MS,
) {
  await rateGate();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "WildlifeDataCollector/3.0 (contact: hritik.saini@example.com) Nodejs/Fetch",
      },
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (e: any) {
    clearTimeout(id);
    logToUI(`Error: ${e.message || e}`);
    throw e;
  }
}

export async function secureFetch(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(url);

      if (res.status === 429) {
        logToUI("🚨 RATE LIMIT JAIL! Sleeping for 90 seconds...");
        state.stats.rateLimited++;

        // adaptSystem ko signal bhejna ki hum jail mein hain
        state.flags.setBatchRateLimited?.();
        state.adaptive.stableBatches = 0; // Stability reset

        const wait = 90000 + i * 5000;
        await new Promise((r) => setTimeout(r, wait));
        i = 0;
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Non-JSON response");
      }
      return await res.json();
    } catch (e: any) {
      if (i === retries - 1) {
        logToUI(`Final Failure for ${url}: ${e.message}`);
        throw e;
      }
      const backoff = Math.pow(2, i) * 2000;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("secureFetch exhausted retries without response");
}
