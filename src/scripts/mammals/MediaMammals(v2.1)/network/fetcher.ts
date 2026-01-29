import fetch from "node-fetch";
import { CONFIG } from "../config/config.ts";
import { state } from "../state/state.ts";

export async function fetchWithTimeout(
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