// suggest.js - "Did you mean" for a search that found nothing.
//
// Built from the words the database itself holds, so it can only ever offer
// a word some entry contains, and every offer carries the real count it would
// return. Nothing is corrected behind the user's back: a search for ribozome
// still answers 0, with ribosome and ribozyme offered as links.
// NCBI PubMed does the same (ESpell); RCSB, PDBe and UniProt offer nothing.

import { query } from "./db.js";
import { clean_text, singular, count_entries, organism_suggestions } from "./search.js";
import { taxa_named, name_key } from "./taxonomy.js";

// Every word of every entry's searchable text, with how many entries hold it.
// The same normalising as doc.prose: lower case, punctuation dropped.
const VOCABULARY = `
    SELECT w, count(DISTINCT id)::int AS n FROM (
        SELECT id, regexp_split_to_table(
                   prose || ' ' || regexp_replace(lower(coalesce(entities, '') || ' ' || coalesce(residues, '')),
                                                  E'[^a-z0-9 \\n]', '', 'g'),
                   E'\\\\s+') AS w
          FROM doc) x
     WHERE length(w) >= 3
     GROUP BY w`;

// doc changes only when a load refreshes it; this notices that in ~2 ms.
const SIGNATURE = `SELECT count(*)::text || ' ' || coalesce(sum(hashtext(prose))::text, '0') AS s FROM doc`;
const CHECK_MS = 60 * 1000;

let vocab = null;
let checked = 0;
let pending = null;

export async function vocabulary(q = query) {
    if (vocab && Date.now() - checked < CHECK_MS) return vocab;
    pending ??= (async () => {
        try {
            let sig = (await q(SIGNATURE)).rows[0].s;
            if (!vocab || vocab.signature !== sig) {
                let rows = (await q(VOCABULARY)).rows;
                vocab = { signature: sig, words: new Map(rows.map((r) => [r.w, r.n])) };
            }
            checked = Date.now();
            return vocab;
        } finally {
            pending = null;
        }
    })();
    return pending;
}

// Typing distance with a swap of two neighbours counted as one slip
// (optimal string alignment). Gives up early once past the cap.
export function distance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let cur = [i], low = i;
        for (let j = 1; j <= b.length; j++) {
            let c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                c = Math.min(c, prev2[j - 2] + 1);
            }
            cur.push(c);
            low = Math.min(low, c);
        }
        if (low > cap) return cap + 1;
        prev2 = prev;
        prev = cur;
    }
    return prev[b.length];
}

// One slip in a short word, two in a long one. Shorter words are not
// corrected at all: tna is one slip from rna, dna, tra and many more.
const MIN_LENGTH = 4;
const slips = (word) => (word.length <= 7 ? 1 : 2);

// Words the search would find as they are. The box matches inside words, so
// a word is known if any database word contains it (or its singular).
function known(word, words) {
    let one = singular(word);
    for (const w of words.keys()) {
        if (w.includes(word) || w.includes(one)) return true;
    }
    return false;
}

// The closest database words, commonest first. Only the fewest slips count:
// nucleosme offers nucleosome, not nuclease two slips away. A word holding
// another offer is dropped, since the box matches inside words and the shorter
// finds it anyway: ribosomes, and gquadruplex (G-quadruplex) beside quadruplex.
export function closest(word, words, limit = 3) {
    let cap = slips(word), found = [];
    for (const [w, n] of words) {
        let d = distance(word, w, cap);
        if (d <= cap) found.push({ w, n, d });
    }
    let best = Math.min(...found.map((f) => f.d));
    found = found.filter((f) => f.d === best);
    return found
        .filter((f) => !found.some((g) => g !== f && f.w.includes(g.w)))
        .sort((a, b) => b.n - a.n)
        .slice(0, limit);
}

// Past this many unknown words the search is not a typo but something else.
const MAX_UNKNOWN = 3;
const MAX_TRIED = 9;
const MAX_OFFERED = 3;

// Keeps the capital a word was typed with: Ribozome -> Ribosome.
function as_typed(typed, word) {
    return /^[A-Z]/.test(typed) ? word[0].toUpperCase() + word.slice(1) : word;
}

// Up to three corrected searches, each { field, value, total }, best first:
// the box to change, what to put in it, and what that would find. Every other
// filter in the query is kept, so each total is what the link will show.
// Empty when nothing close exists. Asked only of a search that found nothing.
export async function did_you_mean(query_params, q = query) {
    if (query_params.match === "excludes") return [];
    let offers = [...await search_box_offers(query_params, q), ...await organism_offers(query_params)];
    return offers.slice(0, MAX_OFFERED);
}

// The organism boxes take a whole name, so the whole name is compared with
// every scientific and common name we hold: mus musculas, Mus musculus.
const ORGANISM_BOXES = { source_organism: "source_organisms", expression_host: "expression_hosts" };

async function organism_offers(query_params) {
    let offers = [];
    for (const [field, role] of Object.entries(ORGANISM_BOXES)) {
        let typed = clean_text(String(query_params[field] ?? ""));
        let key = name_key(typed);
        if (key.length < MIN_LENGTH || taxa_named(typed).length > 0) continue;

        let cap = slips(key);
        let close_rows = (await organism_suggestions(role))
            .map((row) => ({
                row,
                d: Math.min(...[row.code, ...row.name.split(", ")].filter(Boolean)
                    .map((n) => distance(key, name_key(n), cap)))
            }))
            .filter((c) => c.d <= cap);
        let best = Math.min(...close_rows.map((c) => c.d));
        let picks = close_rows.filter((c) => c.d === best)
            .sort((a, b) => b.row.entries - a.row.entries).slice(0, MAX_OFFERED);

        for (const { row } of picks) {
            let total = await count_entries({ ...query_params, [field]: row.code });
            if (total > 0) offers.push({ field, value: row.code, total });
        }
    }
    return offers;
}

async function search_box_offers(query_params, q) {
    let text = clean_text(String(query_params.q ?? ""));
    if (!text) return [];

    let { words } = await vocabulary(q);

    // Each word as typed, where it sits, and its normalised form.
    let tokens = [...text.matchAll(/[\p{L}\p{N}]+/gu)]
        .map((m) => ({ typed: m[0], at: m.index, word: m[0].toLowerCase() }))
        .filter((t) => t.word.length >= MIN_LENGTH && !known(t.word, words));

    if (tokens.length === 0 || tokens.length > MAX_UNKNOWN) return [];

    let options = tokens.map((t) => closest(t.word, words));
    if (options.some((o) => o.length === 0)) return [];

    // Every combination of the closest words, fewest slips first.
    let combos = [[]];
    for (const o of options) combos = combos.flatMap((c) => o.map((x) => [...c, x]));
    combos = combos
        .map((c) => ({ picks: c, slips: c.reduce((s, x) => s + x.d, 0) }))
        .sort((a, b) => a.slips - b.slips)
        .slice(0, MAX_TRIED);

    let offers = await Promise.all(combos.map(async ({ picks, slips }) => {
        // Replaced from the end, so earlier positions stay right.
        let fixed = text;
        for (let i = tokens.length - 1; i >= 0; i--) {
            let t = tokens[i];
            fixed = fixed.slice(0, t.at) + as_typed(t.typed, picks[i].w) + fixed.slice(t.at + t.typed.length);
        }
        let total = await count_entries({ ...query_params, q: fixed });
        return { q: fixed, total, slips };
    }));

    let seen = new Set();
    return offers
        .filter((o) => o.total > 0 && !seen.has(o.q) && seen.add(o.q))
        .sort((a, b) => a.slips - b.slips || b.total - a.total)
        .slice(0, MAX_OFFERED)
        .map(({ q, total }) => ({ field: "q", value: q, total }));
}
