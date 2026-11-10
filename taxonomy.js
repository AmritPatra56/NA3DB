// taxonomy.js - which of our organisms a typed name means.
//
// The organism columns hold one scientific name per row, as the depositor
// wrote it. People type "mouse", "E. coli" or "yeast", and depositors write
// "Escherichiacoli 'BL21-Gold(DE3)pLysS AG'". taxonomy.json (made by
// db/fetch_taxonomy.mjs from NCBI Taxonomy) holds the other names of every
// taxon we have, so a typed name can be turned into taxonomy ids. RCSB and
// PDBe search NCBI common names the same way.

import { readFileSync } from "node:fs";

const { taxa } = JSON.parse(readFileSync(new URL("./taxonomy.json", import.meta.url), "utf8"));

// Lower case, accents and punctuation gone, single spaces: "E. coli" and
// "e coli" are one name, and so are "brewer's yeast" and "brewers yeast".
export function name_key(text) {
    return String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
        .replace(/'/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
const compact = (key) => key.replaceAll(" ", "");

// Each taxon's names, keyed once at start-up.
const NAMES = Object.values(taxa).map((t) => ({
    taxid: t.taxid,
    // Matched whole or by their last words, where English puts the thing
    // named: mouse finds "house mouse", yeast "baker's yeast", fly "fruit
    // fly", but mouse does not find Arabidopsis, the "mouse-ear cress".
    common: t.common.map(name_key),
    // Matched whole or as the first word: HIV finds HIV-1 and HIV-2.
    acronyms: (t.acronyms ?? []).map(name_key),
    // Matched whole: these are other scientific names, so part of one would
    // drag in strangers. Mus alone must not find the rat, Mus norvegicus.
    whole: [t.name, ...t.synonyms].map(name_key),
    // Matched whole, and this is the tree: Escherichia coli finds its
    // strains, Saccharomyces its species, Bacteria every bacterium.
    lineage: t.lineage.map(name_key)
}));

// Shorter than this names too much: "e" or "co" would start a word in
// half the common names.
const MIN_LENGTH = 3;

const cache = new Map();
const CACHE_SIZE = 500;

// The taxonomy ids a typed name means, as a sorted list. Empty when it
// names none of ours, and then the text match alone decides, as before.
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

    // A name covers what sits under it in the tree: E. coli its strains,
    // mouse Mus musculus domesticus, as typing Escherichia coli already does.
    let named = new Set(found.map((id) => name_key(taxa[id].name)));
    found = NAMES
        .filter((t) => found.includes(t.taxid) || t.lineage.some((l) => named.has(l)))
        .map((t) => t.taxid)
        .sort((a, b) => a - b);

    if (cache.size >= CACHE_SIZE) cache.clear();
    cache.set(key, found);
    return found;
}

// A taxon's names for display: the scientific name and the common ones.
export function taxon(taxid) {
    let t = taxa[taxid];
    return t ? { name: t.name, common: t.common } : null;
}
