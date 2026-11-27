// Picks of one key mean any of them, a not_ key none of them; different keys must all match.

import { structures } from "./format.js";
import { searchable } from "./query.js";

const NOT = "not_";

export function pickQuery(picks) {
  const byKey = new Map();
  for (const pick of picks) {
    const values = byKey.get(pick.key) ?? [];
    for (const v of pick.values) if (!values.includes(v)) values.push(v);
    byKey.set(pick.key, values);
  }
  return byKey;
}

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
