// The rules for answering several landing rows at once (public/pick.js), as
// plain functions: no page, no state, so Phase 5 can call them from Landing.
//
// A pick is { key, values, label }: one row's Yes (polymer_type=DNA), its No
// (not_polymer_type=DNA) or a ticked option. Picks of one key mean either
// (DNA or RNA); a not_ key, none of them; different keys must all match.
// That is how /search reads them, so the count is what Search finds.

import { structures } from "./format.js";
import { searchable } from "./query.js";

const NOT = "not_";

// What the picks ask, one key at a time: values merged in the order picked,
// each value once.
export function pickQuery(picks) {
  const byKey = new Map();
  for (const pick of picks) {
    const values = byKey.get(pick.key) ?? [];
    for (const v of pick.values) if (!values.includes(v)) values.push(v);
    byKey.set(pick.key, values);
  }
  return byKey;
}

// The picks in words, the way the search reads them:
// (DNA or RNA) and X-ray and not (Bacteria or Archaea).
// Typed text comes first, in quotes, once it is long enough to be searched.
export function pickSummary(picks, text = "") {
  const groups = new Map();
  for (const pick of picks) groups.set(pick.key, [...(groups.get(pick.key) ?? []), pick.label]);
  const parts = [...groups].map(([key, labels]) => {
    const said = labels.length > 1 ? `(${labels.join(" or ")})` : labels[0];
    return key.startsWith(NOT) ? "not " + said : said;
  });
  if (searchable(text)) parts.unshift(`“${text}”`);
  return parts.join(" and ");
}

// The address that runs the box and the picks together. extra is a picked
// suggestion ({ ligand: "MG" }), joined to its key's values, never twice.
export function pickUrl(base, text, picks, extra = {}) {
  const params = new URLSearchParams(base);
  if (searchable(text)) params.set("q", text);
  const query = pickQuery(picks);
  for (const [key, value] of Object.entries(extra)) {
    query.set(key, [...new Set([...(query.get(key) ?? []), value])]);
  }
  for (const [key, values] of query) params.set(key, values.join(","));
  return params.toString();
}

export const pickWords = (n) => (n === 0 ? "No structures match" : structures(n));
