import { readFileSync } from "node:fs";

const { taxa } = JSON.parse(readFileSync(new URL("./taxonomy.json", import.meta.url), "utf8"));

export function name_key(text) {
    return String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
        .replace(/'/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
const compact = (key) => key.replaceAll(" ", "");

const NAMES = Object.values(taxa).map((t) => ({
    taxid: t.taxid,
    // By the last words: mouse finds "house mouse", not "mouse-ear cress".
    common: t.common.map(name_key),
    acronyms: (t.acronyms ?? []).map(name_key),
    // Whole only: Mus alone must not find Mus norvegicus.
    whole: [t.name, ...t.synonyms].map(name_key),
    lineage: t.lineage.map(name_key)
}));

const MIN_LENGTH = 3;

const cache = new Map();
const CACHE_SIZE = 500;

export function taxa_named(text) {
    let key = name_key(text ?? "");
    if (key.length < MIN_LENGTH) return [];
    if (cache.has(key)) return cache.get(key);

    let squeezed = compact(key);
    let found = NAMES
        .filter((t) =>
            t.common.some((c) => c === key || c.endsWith(` ${key}`) || compact(c) === squeezed) ||
            t.acronyms.some((a) => a === key || a.startsWith(`${key} `)) ||
            t.whole.includes(key) ||
            t.lineage.includes(key))
        .map((t) => t.taxid);

    let named = new Set(found.map((id) => name_key(taxa[id].name)));
    found = NAMES
        .filter((t) => found.includes(t.taxid) || t.lineage.some((l) => named.has(l)))
        .map((t) => t.taxid)
        .sort((a, b) => a - b);

    if (cache.size >= CACHE_SIZE) cache.clear();
    cache.set(key, found);
    return found;
}

export function taxa_exactly_named(text) {
    let key = name_key(text ?? "");
    if (key.length < MIN_LENGTH) return [];

    let named = new Set(NAMES.filter((t) => t.whole.includes(key)).map((t) => t.whole[0]));
    if (named.size === 0) return [];

    return NAMES
        .filter((t) => named.has(t.whole[0]) || t.lineage.some((l) => named.has(l)))
        .map((t) => t.taxid)
        .sort((a, b) => a - b);
}

export function is_common_name(text) {
    let key = name_key(text ?? "");
    if (key.length < MIN_LENGTH) return false;
    return NAMES.some((t) => t.common.includes(key) || t.acronyms.includes(key));
}

export function taxon(taxid) {
    let t = taxa[taxid];
    return t ? { name: t.name, common: t.common } : null;
}

const LINEAGES = new Map(Object.values(taxa).map((t) => [name_key(t.name), t.lineage.map(name_key)]));
export function lineage_of(name) {
    return LINEAGES.get(name_key(name ?? "")) ?? [];
}
