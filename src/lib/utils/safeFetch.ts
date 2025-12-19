// src/lib/utils/safeFetch.ts
export async function safeFetch(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeout);
    return res;
  } catch (err) {
    if (retries <= 0) throw err;

    console.warn("[GBIF] socket dropped, retrying…");
    await new Promise(r => setTimeout(r, 2000));
    return safeFetch(url, options, retries - 1);
  }
}
