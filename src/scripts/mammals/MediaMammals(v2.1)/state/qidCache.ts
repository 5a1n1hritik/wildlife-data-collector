export const qidCache = new Map<string, string | null>();

export function getCachedQID(name: string): string | null | undefined {
  return qidCache.get(name);
}

export function setCachedQID(name: string, qid: string | null) {
  qidCache.set(name, qid);
}
