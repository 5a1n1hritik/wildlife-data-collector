export function pickBestClaim(claims: Record<string, any[]>, p: string) {
  const list = claims[p];
  if (!Array.isArray(list)) return null;

  return (
    list.find((c) => c.rank === "preferred") ??
    list.find((c) => c.rank === "normal") ??
    null
  );
}

export function parseClaim(claims: any, p: string) {
  const claim = pickBestClaim(claims, p)?.mainsnak?.datavalue;
  if (!claim) return null;

  if (claim.type === "quantity") {
    return {
      type: "quantity",
      amount: parseFloat(claim.value.amount),
      unitQid:
        claim.value.unit === "1" ? null : claim.value.unit.split("/").pop(),
    };
  }

  if (claim.type === "wikibase-entityid") {
    return { type: "qid", value: claim.value.id }; // sirf QID
  }

  if (p === "P18") {
    return {
      type: "image",
      file: claim.value,
    };
  }

  return null;
}

export function extractClaims(claims: any, pList: readonly string[]) {
  const out: Record<string, any> = {};
  let found = false;

  for (const p of pList) {
    const value = parseClaim(claims, p);
    if (value !== null) {
      out[p] = value;
      found = true;
    }
  }

  return found ? out : null;
}
