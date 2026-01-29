import { UNITS_MAP } from "../config/config.ts";

export function normalizeClaim(raw: any) {
  if (!raw) return null;

  if (raw.type === "quantity") {
    const unit = raw.unitQid ? UNITS_MAP[raw.unitQid] : null;
    return {
      value: unit ? +(raw.amount * unit.factor).toFixed(2) : raw.amount,
      unit: unit?.label ?? null,
      dimension: unit?.dimension,
      raw,
    };
  }

  if (raw.type === "qid") {
    return { type: "qid", qid: raw.value };
  }

  if (raw.type === "image") {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(raw.file)}?width=1000`;
  }

  return raw;
}

export function normalizeGroup(group: any) {
  if (!group || typeof group !== "object") return {};
  const out: Record<string, any> = {};

  for (const [p, raw] of Object.entries(group)) {
    out[p] = normalizeClaim(raw);
  }

  return out;
}
